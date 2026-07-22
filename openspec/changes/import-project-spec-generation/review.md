---
verdict: pass
reviewer: review-worker
model: sonnet
round: 2
change_id: import-project-spec-generation
rework_commit: 54bf6bd
---

# Review — Round 2

Round 1 flagged 3 major + 5 minor + 2 info findings. Rework commit `54bf6bd`
claims all are fixed. This round verifies each finding and runs a fresh pass for
new issues introduced by the rework.

---

## Round-1 Finding Verification

### F1 — Listener leak on SSE disconnect: RESOLVED

`subscribeToJob` is now called inside the Promise executor. The returned `unsub`
is stored immediately. `reply.raw.on("close", ...)` calls `unsub()` then
`finish()`. The `finish()` guard (`if (!alive) return`) makes it idempotent.
For already-completed jobs, `subscribeToJob` returns `() => {}` — the close
handler still calls it harmlessly.

The restructuring also eliminates the polling loop (F10 fix bundled in):
the `await new Promise<void>` now resolves directly from event callbacks rather
than a 500ms `setTimeout` chain.

No listener leak path remains.

### F2 — No subprocess timeout: RESOLVED

A `SUBPROCESS_TIMEOUT_MS` wall-clock timer (default 10 min, configurable via
`IMPORT_TIMEOUT_MS` env var) is set after spawn. On expiry: `timedOut = true`,
`child.kill("SIGTERM")`. A nested `setTimeout(SIGKILL, 5_000).unref()` follows
as a grace period. The `child.on("close")` handler checks `timedOut` and emits
an `error` SSE event with a human-readable message before calling
`scheduleEviction`.

One minor residual: `cleanup()` only cancels the outer SIGTERM timer handle
(stored in `timeoutHandle`). The nested SIGKILL timer is not stored, so it
cannot be cancelled if the process exits cleanly after SIGTERM. It fires 5s
later, catches `ESRCH` from `child.kill("SIGKILL")`, and swallows the error.
The `.unref()` prevents it blocking process exit. This is harmless but
untidy — classified as **info** below (NF1).

### F3 — React state-during-render in ImportProjectFlow: RESOLVED

`onComplete` is now called inside `useEffect(() => { if (phase.name === "done") onComplete(...); }, [phase, onComplete])`. The direct render-time call is gone. The dev warning and Strict Mode double-invocation via render are eliminated.

One new sub-issue introduced by the fix: the `onComplete` prop is passed as an
inline arrow function in `App.tsx` (line 266), not wrapped in `useCallback`. On
every App re-render the reference changes, causing the effect to re-run whenever
App re-renders while `phase.name === "done"`. In practice the subsequent
`setImportFlowActive(false)` unmounts `ImportProjectFlow` before another re-render
can cause a second fire (React 18 auto-batches the state updates), and even a
double invocation would only call `load()` an extra time. This is **minor** (NF2)
rather than blocking.

### F4 — Boot prompt in argv (comment/implementation mismatch): PARTIALLY RESOLVED

The prompt is no longer passed as `spawn(claudeBin, ["-p", bootPrompt], ...)`.
The spawn is now `spawn(claudeBin, ["-p"], ...)` with `child.stdin.write(bootPrompt)`.
This removes the prompt from `argv` and from `ps aux` output.

However, the function-level JSDoc comment (lines 302-305) still says:
> "The boot prompt is written to a temp file (mode 0o600) and passed via
> `--prompt-file` / `-p` flag"

This is incorrect — no temp file is created and `-p` is the `--print` flag
(boolean), not a `--prompt-file` flag. The inline comment at lines 335-336
correctly describes stdin, but it contradicts the JSDoc. This is a new
documentation error swapped for the old one — classified as **minor** (NF3).

Additionally, whether `claude -p` (the `--print` flag, with no positional prompt
argument) reads from stdin when stdin is piped is NOT validated by any test.
The stub path exercises everything else; the real binary path is untested. The
inline comment asserts this works ("reads from stdin when no positional prompt
argument is given") but this behavior is not documented in `claude --help`. The
existing codebase's `agents/registry.ts` always passes the prompt as a
positional arg after `-p`, never via stdin. If the claude binary does not accept
piped stdin as the prompt, the real (non-stub) import job will silently fail.
This is a **minor** risk until manually verified (NF4).

### F5 — Blocklist gaps: RESOLVED

All specifically-requested paths are now blocked: `/usr/local`, `/Library`,
`/private`, `/var`, `/opt`, `/root`, `/System`. The localhost-only gate comment
is present. The residual gap (`/usr` itself, `/usr/share`, `/usr/lib`) was not
in the round-1 required list and is acceptable given the localhost-only primary
gate.

### F6 — walkDir follows symlinks: RESOLVED

`stat` replaced with `lstat` throughout (walk + size estimation). An explicit
`if (st.isSymbolicLink()) return` guard is present in `walkDir`. The F6 regression
test (symlink pointing to `/etc/hosts`) is included and passes.

### F7 — docs/ walked twice: RESOLVED

The second `walkDir(docsDir, ...)` call is removed. Both `codeFiles` and
`docFiles` are now accumulated into `Set<string>` in a single walk, giving O(1)
dedup. The F7 regression test (docs/guide.md counted exactly once) passes.

### F8 — jobs Map unbounded: RESOLVED

`scheduleEviction(jobId)` is called from all terminal paths (`done`, `error`,
`timedOut`). The TTL is 5 minutes (`JOB_TTL_MS = 5 * 60 * 1000`) with
`.unref()` so it doesn't prevent server shutdown. An LRU cap of 100 jobs
(`JOBS_MAX`) evicts the oldest entry if the Map is full when a new job starts.

### F9 — statSync inside async chain: RESOLVED

`statSync` is removed from imports. All size estimations now use `(await lstat(f)).size`.

### F10 — SSE polling loop: RESOLVED

Bundled into the F1 restructuring. The `checkDone` polling loop is gone; the
promise resolves via direct event callbacks.

---

## New Findings (Round 2)

### NF1 (severity: info)
**File**: `server/import-spec-gen.ts:362-369`
**Issue**: The nested SIGKILL grace timer is created inside the timeout callback
but not stored in any variable, so `cleanup()` cannot cancel it. If the child
exits cleanly after receiving SIGTERM (the common case), `cleanup()` runs in the
`close` handler and cancels the outer SIGTERM timer — but the SIGKILL timer
still fires 5 seconds later. `child.kill("SIGKILL")` throws `ESRCH` (no such
process), caught by the surrounding `try/catch`. The `.unref()` on the timer
prevents it blocking server shutdown. This is harmless but creates a dangling
5-second timer after every timeout event.

**Fix (optional)**: Store the SIGKILL timer handle in a variable in the outer
scope and cancel it in `cleanup()`.

---

### NF2 (severity: minor)
**File**: `web/src/App.tsx:266-270` / `web/src/components/ImportProjectFlow.tsx:45-49`
**Issue**: The `onComplete` prop passed to `<ImportProjectFlow>` is an inline
arrow function that is recreated on every App re-render. The `useEffect` in
`ImportProjectFlow` depends on `[phase, onComplete]`. If App re-renders (e.g.
when `load()` resolves and updates Zustand state) while `ImportProjectFlow` is
still mounted with `phase.name === "done"`, the effect re-runs and calls
`onComplete` a second time. In practice React 18 auto-batching unmounts
`ImportProjectFlow` before this second fire can happen (since `setImportFlowActive(false)`
is in the same batch), but this relies on implementation-specific timing.

**Fix**: Wrap the `onComplete` callback in `App.tsx` in `useCallback` with
appropriate deps, OR narrow the `useEffect` dep list to `[phase.name]` and
capture `onComplete` via a ref.

---

### NF3 (severity: minor)
**File**: `server/import-spec-gen.ts:300-305` (JSDoc)
**Issue**: The function-level JSDoc for `startGenerationJob` still says "The boot
prompt is written to a temp file (mode 0o600) and passed via `--prompt-file` / `-p`
flag." No temp file is created anywhere in the function, and `-p` is the `--print`
boolean flag, not a `--prompt-file` flag. The inline comment correctly describes
the stdin approach, creating a contradiction in the same file.

**Fix**: Update the JSDoc to: "The boot prompt is piped to the subprocess via
stdin so it never appears in `ps aux` / `/proc/<pid>/cmdline`."

---

### NF4 (severity: minor)
**File**: `server/import-spec-gen.ts:344` / no test covering this
**Issue**: The real (non-stub) spawn path is `spawn(claudeBin, ["-p"], ...)` with
the prompt written to `child.stdin`. Whether the `claude` binary reads a piped
stdin as the prompt when `-p` is given without a positional argument is
undocumented and unverified by any automated test. The existing `agents/runner.ts`
pattern always uses `-p <prompt>` as a positional arg (lines 736-737). The
F2-regression test exercises only the stub path. If the real binary treats `-p`
with no argument as "enter interactive mode, read from TTY", the subprocess will
hang until the timeout kills it — the F2 fix then masks this latent bug by
converting it into a 10-minute wait followed by an error.

**Fix**: Manually verify `echo "prompt text" | claude -p` produces output before
shipping. Alternatively, revert to the positional-arg approach
(`spawn(claudeBin, ["-p", bootPrompt], ...)`) which mirrors the existing
registry.ts pattern and is known to work, accepting the minor `ps` exposure.

---

## Verdict

**pass** — all three round-1 major findings (F1, F2, F3) and all five minor
findings (F4-F8) are resolved. The two info findings (F9, F10) are also
addressed.

Four new findings are introduced by the rework: two are minor (NF2 on-complete
double-invocation risk, NF3 JSDoc mismatch), one is minor-risk (NF4: real
claude binary stdin behavior unverified), and one is info (NF1: SIGKILL timer
not cancelled on clean exit after SIGTERM). None of these are blocking — the
major resource-safety and React correctness bugs from round 1 are fixed. The
overall code health is significantly improved.

Recommended follow-ups before manual end-to-end verification (task 7.3 /
8.5-8.9):
1. Verify `echo "..." | claude -p` reads stdin as the prompt (NF4).
2. Fix the JSDoc on `startGenerationJob` (NF3, one-liner).
3. Consider `useCallback` for `onComplete` in App.tsx (NF2, low-risk as-is).
