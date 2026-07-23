---
verdict: needs-rework
reviewer: manager-fallback
model: sonnet
round: 2
change_id: refactor-import-to-task-tool-subagent
---

# Review — Round 2

Round-1 had 1 critical + 1 major + 3 minor + 2 info findings. The rework
commit `6f50129` addressed the major and minor findings cleanly. However,
the critical finding (F1) is only partially fixed: the watch mechanism now
fires correctly, but the client-side completion predicate prevents
`onComplete` from ever firing in the canonical import scenario.

## Round-1 findings: status

### F1 (critical) — `state-replaced` fires but completion predicate is still broken

**Status: NOT RESOLVED — re-classified as critical**

The rework added `ProjectRootWatcher` which correctly fires `state-replaced`
when `openspec/` is created at runtime. It also starts the real `Watcher` on
the new `openspec/` directory, which fires a second `state-replaced` when
`openspec/GENERATED.md` is written. Both broadcasts are sound.

However, the completion check in `ImportProgress.tsx` (line 47) is:

```ts
if (state && state.exists && state.generatedMarkerPresent) {
```

The `state.exists` field comes from `/api/state` →
`scanWorkspace(openspecDir, PROJECT_ROOT)` where `openspecDir` is the
module-level constant resolved once at boot. In the import scenario, ithyno
starts with no `openspec/` → `openspecDir === null` at boot and never
changes. Every call to `/api/state` returns `{ exists: false, ... }`
regardless of whether `openspec/` has since been created on disk.

`scanWorkspace` does compute `generatedMarkerPresent` independently:

```ts
const generatedMarkerPresent = existsSync(join(projectRoot, "openspec", "GENERATED.md"));
if (!openspecDir) {
  return { root: projectRoot, exists: false, ..., generatedMarkerPresent };
}
```

So after GENERATED.md is written the response is
`{ exists: false, generatedMarkerPresent: true }`, but `ImportProgress`
requires `state.exists === true` to fire. That condition is impossible to
satisfy without a server restart.

End-to-end trace confirming the hang:

1. ithyno starts, `openspecDir = null`
2. Import dispatched → PTY gets the command → sub-agent starts
3. Sub-agent runs `openspec init` → `openspec/` directory created
4. `ProjectRootWatcher` fires → `startOpenspecWatcher(newDir)` + `broadcast({ type: "state-replaced" })`
5. Client receives `state-replaced` → `fetchState()` → `/api/state` → `{ exists: false, generatedMarkerPresent: false }` (GENERATED.md not yet written)
6. Sub-agent writes specs, then writes `openspec/GENERATED.md`
7. Watcher on `openspec/` detects GENERATED.md (is `.md`) → broadcasts `state-replaced`
8. Client receives `state-replaced` → `fetchState()` → `/api/state` → `{ exists: false, generatedMarkerPresent: true }` (openspecDir still null)
9. `ImportProgress` checks `state.exists && state.generatedMarkerPresent` → `false && true` → **never fires `onComplete`**

The dashboard hangs indefinitely — same symptom as before the rework, just at step 9 instead of step 4.

**Fix**: Remove the `state.exists` guard from the completion predicate.
`generatedMarkerPresent` is independently computed by `scanWorkspace` and
is the correct sentinel. Change line 47 of `ImportProgress.tsx` from:

```ts
if (state && state.exists && state.generatedMarkerPresent) {
```

to:

```ts
if (state && state.generatedMarkerPresent) {
```

Also update the `isImportComplete` mirror function in
`ImportProgress.test.ts` line 37, and the test comment on line 7, and any
test cases that assume `exists: true` is required (the test at line 93 of
`ImportProgress.test.ts` uses `exists: true` in the `midImport` state but
that test is fine as written — that case asserts non-completion when
`generatedMarkerPresent` is false, which is still correct).

Note: `state.exists` is not needed because `generatedMarkerPresent` can only
become `true` after `openspec/GENERATED.md` is written, which happens in
Step 6 of the sub-agent flow after `openspec init` has already run. The
extra `exists` check adds no safety — it only blocks completion.

---

### F2 (major) — 400 size cap test

**Status: RESOLVED**

Test added at `server/import-spec-gen.test.ts:135–150`. Creates a sparse
51 MB `.ts` file via `truncate`, calls `preflight`, asserts
`ok === false`, `status === 400`, reason matches `/exceeds/` and `/50 MB/`.
The `lstat.size` approach correctly uses the logical file size so the test
does not write 51 MB to disk. The test file for the size-exceeding case is
a `.ts` file which is included in the `walkDir` scan. Coverage confirmed.

### F3 (minor) — `onComplete` once-guard

**Status: RESOLVED**

`const firedRef = useRef(false)` is declared at component scope (line 40 of
`ImportProgress.tsx`), outside the `useEffect`. The guard check and set
(`if (firedRef.current) return; firedRef.current = true;`) are inside the
effect. Placement and logic are correct.

### F4 (minor) — control-character rejection

**Status: RESOLVED**

Regex `/[\x00-\x1f\x7f-\x9f]/` in `injectImportCommand` covers:
- `\x00`–`\x1f`: all C0 controls including `\n` (0x0a), `\r` (0x0d), NUL (0x00)
- `\x7f`: DEL
- `\x80`–`\x9f`: C1 controls

Four unit tests cover `\n`, `\r`, `\x00`, and the guard that blocks the
injector from being called at all. The regex is correct and comprehensive
for the stated threat (PTY line injection via control chars).

Backticks (0x60) are printable and not blocked — this was already noted as
info-only in round 1 (F6) and no change is required.

### F5 (minor) — PTY routing

**Status: RESOLVED**

`injectIntoManager(managerCwd, data, terminate)` added to `server/sync/pty.ts`.
`LiveTerminal` now carries `cwd: string` set from `opts.cwd` at spawn time.
The function walks `live[]` from tail (most recently active) to head and
returns the first matching cwd. Returns `{ ok: false, reason: "..." }`
when no match found; the caller maps that to 503.

`managerCwd` is `PROJECT_ROOT`; the PTY spawned in `ptyWss.on("connection")`
uses `cwd = openspecDir ? resolve(openspecDir, "..") : PROJECT_ROOT`. In
the import scenario `openspecDir` is null at boot so the PTY cwd is
`PROJECT_ROOT`. The cwd comparison is exact string match, which works
correctly in both the boot-with-openspec and boot-without-openspec cases.

Multiple PTYs with the same cwd: the tail-to-head walk picks the most
recently used one. Acceptable defensive behavior; comment documents it.

---

## New findings from multi-angle pass

### Finding N1 (minor) — `startOpenspecWatcher` called while `watcher !== null` is impossible but fragile

If `startOpenspecWatcher` were ever called twice (e.g. through a future
refactor calling it from a second code path), it would silently overwrite
the module-level `watcher` reference, orphaning the first `Watcher`
(leaving its chokidar instance running without a reference to stop it).
There is no guard. The current call graph makes this impossible (one of two
mutually exclusive paths: `if (openspecDir) ... else ...`), but a defensive
`if (watcher) { watcher.stop(); watcher = null; }` before the assignment
would be safer for long-term maintainability.

**Severity: minor** — not a bug in the current code; pre-existing pattern
(the old code also had no such guard). No ship-block.

### Finding N2 (info) — `projectRootWatcher` not accessible for explicit shutdown

`projectRootWatcher` is declared in the `else` block and not reachable from
the SIGINT/SIGTERM handlers. This matches the pre-existing behavior for the
main `Watcher` (also not closed on SIGINT — the handlers call
`agentRunner.shutdown(); process.exit(0)` and rely on OS cleanup). No
change needed; consistent with existing shutdown strategy.

### Finding N3 (info) — `withinOpenspec` uses frozen `openspecDir`

`withinOpenspec(filePath)` uses the boot-time `openspecDir` constant for its
main guard (line 303 of `server/index.ts`). After import creates `openspec/`
at runtime, the main `withinOpenspec` guard (`openspecDir && abs.startsWith(...)`)
returns `false` for paths under the new `openspec/`. Write endpoints that
call `withinOpenspec` would reject writes to the imported `openspec/` until
a server restart. This is a pre-existing architectural limitation
(module-level singleton) that pre-dates this change and is not introduced
by the rework. Not a ship-block for this change's scope (import flow only),
but a server restart is required to use the edit API after import.

---

## Verdict

**needs-rework** — F1 is still critical. The `ProjectRootWatcher` correctly
triggers `state-replaced` broadcasts when `openspec/` appears and when
`GENERATED.md` is written, but the completion predicate
`state.exists && state.generatedMarkerPresent` in `ImportProgress.tsx` can
never be satisfied because the server's `/api/state` returns
`{ exists: false }` whenever `openspecDir` was null at boot. The fix is
a one-line change: remove `state.exists &&` from the predicate (and update
the matching test mirror function). All other round-1 findings are resolved.
No new blocking issues are introduced by the rework.
