# Review: enable-import-both-patterns

**Commit**: 951ab27  
**Verdict**: needs-rework  
**Findings**: 6 (2 blocking, 4 advisory)

---

## Blocking

### B1 — `window.ithyno.openProject` is not exposed by the preload; the "Open imported project" button is a no-op in Electron

**File**: `electron/src/preload.ts` / `web/src/components/ImportedProjectNotification.tsx`

`ImportedProjectNotification.tsx` calls `window.ithyno.openProject(targetPath)` and gates the "browser fallback" label on whether that function exists. The preload (`electron/src/preload.ts`) exposes only `onTerminalRestart` and `onImportProject` on the `ithyno` bridge — `openProject` is absent. As a result, `typeof w.ithyno?.openProject === "function"` is always `false` in Electron, `isBrowserFallback()` returns `true`, the button label shows "Copy path" instead of "Open imported project", and clicking it writes to the clipboard rather than switching the project. This is the primary purpose of the notification card.

The fix requires:
1. Add an `IPC_OPEN_PROJECT = 'ithyno:open-project'` channel in preload and expose `openProject: (path) => ipcRenderer.send(...)`.
2. Register a corresponding `ipcMain.on('ithyno:open-project', ...)` handler in `main.ts` that calls `void switchProject(path)`.

**Severity**: blocking — the feature's core action does not work in the delivered shell.

---

### B2 — Notification region CSS classes are entirely absent from `styles.css`

**File**: `web/src/styles.css` (nothing added); `web/src/App.tsx` (line 338); `web/src/components/ImportedProjectNotification.tsx`

The JSX references these CSS classes:
- `.import-notifications-region` (App.tsx — the outer container)
- `.imported-project-notification`
- `.imported-project-notification-body`
- `.imported-project-notification-title`
- `.imported-project-notification-path`
- `.imported-project-notification-time`
- `.imported-project-notification-actions`

None of these selectors appear in `styles.css`. Without positioning rules (e.g. `position: fixed; top: …; right: …; z-index: …`), the notification region renders in document flow below the main content, not in the top-right corner as the spec requires. Stacking behaviour and visual polish (card border, shadow, padding) are also absent. The component renders but is invisible to the user in typical usage.

**Severity**: blocking — the notification is not visible in its intended location.

---

## Advisory

### A1 — Pattern classification uses raw string equality; path normalization not applied

**File**: `server/index.ts` lines 1193

```ts
const pattern: "A" | "B" = targetPath === PROJECT_ROOT ? "B" : "A";
```

`targetPath` comes from `preflight()` which calls `resolve(projectRoot)` — so it is always absolute. `PROJECT_ROOT` is also `resolve(...)`. Both are normalized at module load. The comparison is therefore safe under normal conditions. However:

- Trailing slash divergence is not an issue because `resolve()` strips trailing slashes.
- Symlinks are **not** resolved. If the user passes a symlinked path (e.g. `/home/user/proj` is a symlink to `/data/projects/proj`) and `PROJECT_ROOT` was started with the canonical path, the comparison fails and the job is incorrectly classified as Pattern A.

The fix is to call `fs.realpathSync` on both sides (or at least on `targetPath`) before comparison:

```ts
const realTarget = realpathSync(targetPath, { encoding: "utf8" }) catch (() => targetPath);
const pattern: "A" | "B" = realTarget === PROJECT_ROOT ? "B" : "A";
```

This is advisory because symlinked project roots are an edge case, but it is a silent misclassification with user-visible consequences (Pattern B should trigger in-place completion but Pattern A triggers the external-notification card instead).

---

### A2 — Job TTL expiry while its `ImportTargetWatcher` is still active leaves an orphaned watcher

**Files**: `server/import-jobs.ts`, `server/index.ts`

The TTL sweep in `registerImportJob` calls `registry.delete(id)` for expired jobs. However, `importWatchers` (the `Map<string, ImportTargetWatcher>` scoped to the IIFE) is not swept alongside the job registry. If a job's 1-hour TTL expires before its `GENERATED.md` appears, the registry entry is removed on the next `registerImportJob` call, but the corresponding `ImportTargetWatcher` stays alive indefinitely — watching the target directory, holding a chokidar handle, and capable of calling `broadcast()` and `deleteImportJob()` (which is now a no-op since the job is already gone).

The consequences:
- A delayed `GENERATED.md` appearance (>1h into the job) fires `broadcast({ type: "import-completed" })` after the job is "forgotten", potentially confusing the client.
- Watcher handles accumulate if many imports time out.

Advisory rather than blocking because the 1-hour TTL is very long for a typical import and the worst visible effect is a spurious late notification.

---

### A3 — Doctor gate runs before path authorization check; slow `claude --version` probe on every import request

**File**: `server/index.ts` lines 1176–1188

The current order is:
1. Doctor (`runDoctor()`) — spawns `claude --version` with a 2 s timeout.
2. Path authorization (`isAuthorizedImportPath`).
3. Preflight scan.

The doctor check should logically be the first gate (cheapest-to-diagnose prerequisite), and it is correct to put it before the preflight. However, authorization and body validation (`typeof body.projectRoot !== "string"`) are free string checks that could reject the request before paying the 2-second `claude --version` probe. The recommendation is to move body validation and path authorization checks above the doctor call:

```
1. Body validation (400)
2. Path authorization (403)
3. Doctor gate (409)
4. Preflight scan + size check (400/409)
5. Job registration + dispatch
```

This is advisory (not a correctness bug), but it reduces latency for clearly invalid requests and is a better preflight ordering convention. The proposal doc (`task 3.1`) specifically calls for doctor first, but "before spawning anything" was the intent — body validation does not spawn anything and can go first.

---

### A4 — `pushImportNotification` has no idempotency guard; duplicate WS events would double-add the card

**File**: `web/src/store.ts` lines 336–337

```ts
pushImportNotification: (n) =>
  set((s) => ({ importedProjectNotifications: [...s.importedProjectNotifications, n] })),
```

The server-side `ImportTargetWatcher` fires the callback at most once (guarded by `this.fired = true`). The WebSocket server does not replay historical events on reconnect. So a duplicate `import-completed` event for the same jobId in normal operation is structurally impossible.

However: if a future extension replays events on reconnect, or if a client-side double-mount somehow calls `connectWs` twice (the existing guard defends against this but is not infallible), two cards with the same `id` would appear. Since `key={n.id}` is used in the render, React would silently show only one DOM node, but the store array would still contain two entries.

Recommend a one-line guard:

```ts
pushImportNotification: (n) =>
  set((s) => ({
    importedProjectNotifications: s.importedProjectNotifications.some((x) => x.id === n.id)
      ? s.importedProjectNotifications
      : [...s.importedProjectNotifications, n],
  })),
```

Advisory (no observed failure path today).

---

## Non-findings (checked, OK)

- **`ImportTargetWatcher` lifecycle on cancel/error**: The `fired` flag prevents double-callback. The 30-second grace period timer calls `_shutdown()` which sets `stopped = true` and closes the chokidar watcher. The `stop()` public API also calls `_shutdown()`. No resource leak on the happy path.
- **Idempotency by (targetPath, jobId)**: The server guards `!importWatchers.has(jobId)` before creating a new watcher, so two Pattern A imports targeting the same folder but different jobIds each get their own watcher (correct). Same jobId → same watcher (no-op, correct per task 1.3).
- **Cap enforcement atomicity**: JavaScript single-threaded event loop means `sweepExpired(); size >= MAX_JOBS; registry.set()` is effectively atomic — no TOCTOU gap possible.
- **`awaitWriteFinish: false` on `ImportTargetWatcher`**: The marker is `GENERATED.md`. Chokidar fires `add` when the file is created; the `handleAdd` callback only checks `filePath === markerPath` (existence, not content). A partial write that triggers an early `add` event is benign — the file is the completion signal, not its content. No race hazard here.
- **Pattern B WS routing** (`import-completed` → `load()` → `setBrowseMode(false)`): Correct delegation via existing `state-replaced` path in store.
- **WS event type union**: `import-completed` is correctly added to both server's `ServerEvent` and client's `types.ts` `ImportCompletedEvent`.
- **Doctor stub**: Correctly noted in the stub header; the stub only checks `claude` but `readyForManager` semantics are preserved. This is an acknowledged known gap (add-doctor-and-installer parallel branch).
- **`ImportProgress` for Pattern B**: Unchanged from prior behavior — `generatedMarkerPresent` detection works via `state-replaced` → `load()` → `WorkspaceState.generatedMarkerPresent`. No regression.
- **20-job 429**: Correct, with a clear user-visible message. TTL sweep runs before the cap check so expired slots free naturally.
- **Test coverage**: All five test files (watcher, import-jobs, import-spec-gen, notification, store) are present and cover the key contracts. The watcher test uses real filesystem events with appropriate timeouts.
- **VS Code fallback text**: The `ithyno.switchWorkspace` branch is acknowledged as "future follow-up" in the component comment; the code guards it with `typeof w.ithyno?.switchWorkspace === "function"` so it silently falls through to clipboard copy — acceptable.
