---
verdict: needs-rework
reviewer: manager-fallback
model: sonnet
change_id: import-project-spec-generation
---

# Review

## Findings

### Finding 1 (severity: major)
**File**: `server/index.ts:1082` / `server/import-spec-gen.ts:406-411`
**Issue**: `subscribeToJob()` returns an unsubscribe function (`unsub`) but the SSE handler never calls it when the client disconnects. When `reply.raw` emits `close` (client disconnect), `alive` is set to false and the promise resolves — but the listener closure added to `job.listeners` is never removed. If multiple clients connect and disconnect during a long-running import, the `job.listeners` array accumulates dead closures. These closures hold references to closed `ServerResponse` objects, causing write errors swallowed silently. For jobs that run a long time, this is a slow memory and object leak.

**Fix**: Call `unsub()` inside the `reply.raw.on("close", ...)` handler:
```ts
reply.raw.on("close", () => {
  alive = false;
  if (unsub) unsub();   // add this
});
```
Alternatively, restructure so `subscribeToJob` is called after the close handler is registered, and the close handler directly invokes the returned unsub.

---

### Finding 2 (severity: major)
**File**: `server/import-spec-gen.ts:289-386`
**Issue**: No timeout or kill mechanism for the spawned `claude` subprocess. If the subagent hangs (e.g. waiting for user input in an unexpected path, network stall, or API error that freezes the client), the process runs indefinitely. The corresponding SSE handler's `checkDone` loop (polling every 500ms) will also spin forever since `alive` stays true as long as the client stays connected. Two cascading effects: (1) the process is never reaped → zombie/orphan consuming memory and LLM quota; (2) the Fastify route handler never returns → the Node.js request is held open indefinitely, consuming a file descriptor and event-loop resources.

**Fix**: Add a wall-clock timeout (e.g. 10 minutes) after which `child.kill("SIGTERM")` is called. If the process doesn't exit within a grace period, follow with `SIGKILL`. Emit an `error` SSE event so the UI surfaces the timeout to the user.

---

### Finding 3 (severity: major)
**File**: `web/src/components/ImportProjectFlow.tsx:113-116`
**Issue**: The `done` phase calls `onComplete(phase.projectRoot)` directly inside the render function — not inside a `useEffect`. `onComplete` (from `App.tsx`) calls `setImportFlowActive(false)`, `setImportBannerVisible(true)`, and `void load()`. Calling state setters of a parent component during a child component's render is prohibited by React's rules. React 18 will emit a console warning: *"Cannot update a component (`App`) while rendering a different component (`ImportProjectFlow`)"*. In React Strict Mode (dev builds) the render runs twice, making `onComplete` fire twice — `load()` would be triggered twice. In production it may appear to work but is undefined behavior and can break under concurrent features.

**Fix**: Wrap the `onComplete` call in a `useEffect`:
```tsx
useEffect(() => {
  if (phase.name === "done") {
    onComplete(phase.projectRoot);
  }
}, [phase, onComplete]);  // or narrow the dep list appropriately
```

---

### Finding 4 (severity: minor)
**File**: `server/import-spec-gen.ts:309-310` vs `:322`
**Issue**: The comment at line 310 reads `"We pass the prompt via stdin to avoid shell quoting issues."` but the actual code on line 322 is `spawn(claudeBin, ["-p", bootPrompt], ...)` — the prompt is passed as a command-line argument (`argv`), not via stdin. This is misleading and points to an abandoned implementation plan. Passing the full boot prompt (which contains the resolved `projectRoot` path) in argv means the prompt is visible in `/proc/<pid>/cmdline` on Linux and in `ps aux` output on macOS for the lifetime of the subprocess, potentially exposing the path in process listings.

**Fix**: Either update the comment to accurately describe the `-p` approach, or implement actual stdin-passing: remove `-p bootPrompt` from argv, set `stdio: ["pipe", "pipe", "pipe"]`, and write the prompt to `child.stdin`. The stdin approach is what the comment promises and is more privacy-preserving.

---

### Finding 5 (severity: minor)
**File**: `server/index.ts:1018-1026`
**Issue**: `isAuthorizedImportPath` is permissive by design (documented) but its blocklist has gaps. It blocks `/etc`, `/sys`, `/proc`, `/dev`, `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin` but not `/usr/local`, `/Library`, `/private` (macOS), `/var`, `/opt`, or `/root`. A user (or a compromised UI) could import `/usr/local` or `/private/var` as a project root, triggering a file walk and size scan of those directories, and — if under the 50 MB cap — dispatching a claude subagent to read them. While the localhost-only gate significantly reduces the real attack surface, the authorization check is described as the path-safety boundary and it doesn't live up to that description.

**Fix**: If the intent is truly "any path under the user's home directory or common project locations", implement it that way (e.g. `absPath.startsWith(os.homedir())`). If broad permissiveness is acceptable, at minimum add a note in the code that path safety relies primarily on localhost-only access, not the blocklist.

---

### Finding 6 (severity: minor)
**File**: `server/import-spec-gen.ts:96-111` (walkDir)
**Issue**: `walkDir` uses `stat()` (not `lstat()`), which follows symlinks. A symlink inside the project root that points to a file outside it (e.g. `ln -s /etc/passwd passwords.ts`) will be stat'd as a regular file, counted in the size total, and listed in `filesToScan`. The boot prompt then instructs the subagent to read all scanned files — so the agent would read `/etc/passwd` without any warning. The authorization check at the preflight level only validates the project root path, not individual file paths discovered during the walk.

**Fix**: Switch to `lstat()` so symlinks are identified as symlinks and skipped. Add a check: `if (st.isSymbolicLink()) return;` before processing as code/doc.

---

### Finding 7 (severity: minor)
**File**: `server/import-spec-gen.ts:160-167`
**Issue**: The `docs/` subdirectory is walked twice: once by the main `walkDir(absRoot, ...)` call (which recurses into `docs/` unless it's in `SKIP_DIRS`), and again by an explicit second `walkDir(docsDir, ...)` call. The deduplication guard (`!docFiles.includes(filePath)`) is O(n) per file, making the total dedup cost O(n²) for `n` doc files. For projects with many markdown files this is a quadratic scan. The second walk is also redundant — `docs/` is not in `SKIP_DIRS`, so the first walk already covers it.

**Fix**: Remove the second `walkDir(docsDir, ...)` call entirely. If the intent is to ensure docs are included even when using language-specific source dirs, restructure to run both passes independently and dedup with a `Set`.

---

### Finding 8 (severity: minor)
**File**: `server/import-spec-gen.ts:77` / no cleanup path
**Issue**: The `jobs` Map grows without bound. Each completed or errored job stays in the Map permanently for the lifetime of the server process. Under normal use (few imports) this is negligible, but if imports are used repeatedly the Map accumulates stale entries with their cached `progressLines` arrays (each containing all SSE event strings). There is no TTL, no eviction, and no cap on concurrent jobs.

**Fix**: After emitting the final `done`/`error` event, schedule a cleanup (e.g. `setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000)`) to remove the job state after a window that gives late-joining clients a chance to replay the history.

---

### Finding 9 (severity: info)
**File**: `server/import-spec-gen.ts:169-180`
**Issue**: The size estimation loop uses `statSync` (sync) inside `Promise.all` callbacks. While safe in Node.js's single-threaded event loop, mixing sync fs calls inside otherwise-async Promise chains is stylistically inconsistent and may block the event loop briefly for large projects. The async `stat` import is already in scope from line 21.

**Fix**: Replace `statSync(f).size` with `(await stat(f)).size` to keep the code consistently async.

---

### Finding 10 (severity: info)
**File**: `server/index.ts:1100-1108`
**Issue**: The SSE connection keep-alive is implemented as a 500ms polling loop (`setTimeout(checkDone, 500)`). Each check is a new `setTimeout` call. While harmless in Node.js, this creates a chain of timers for the duration of the import job. When `alive` becomes false, the `Promise` resolves but any pending `setTimeout` from the last iteration still fires once more (it checks `alive` and short-circuits, but it still allocates a timer object). A cleaner pattern would be to use a single `Promise` that resolves via a callback registered on `reply.raw` `close` and on the done/error event.

**Fix**: Replace the polling loop with event-driven resolution:
```ts
await new Promise<void>((res) => {
  reply.raw.once("close", res);
  // done/error listener can call res() too
});
```

---

## Verdict

needs-rework — two major bugs:

1. **Listener leak on SSE disconnect** (Finding 1): The unsubscribe function returned by `subscribeToJob` is never called when the client disconnects, leaving dead listener closures in `job.listeners`.

2. **No subprocess timeout** (Finding 2): A hanging `claude` subprocess runs indefinitely, holding open both the OS process and the Fastify SSE handler with no recovery path.

3. **React state-during-render** (Finding 3): `onComplete` is called inside `ImportProjectFlow`'s render function, updating parent state (`App`) during a child render — a React rules violation that causes a dev warning and potential double-invocation in Strict Mode.

The first two are correctness/resource-safety bugs that could manifest in production. The third is a React anti-pattern that produces warnings and unreliable behavior. All three should be fixed before ship.
