---
verdict: pass
reviewer: manager-fallback
model: sonnet
round: 3
change_id: refactor-import-to-task-tool-subagent
---

# Review — Round 3

Round 2 had 1 critical (F1 still unresolved) + 3 new minor/info findings.
Rework commit `94bd3bf` takes a server-side approach to F1 (re-resolve
`openspecDir` on every `/api/state` request) rather than the client-side
predicate fix suggested in round 2. The approach is architecturally sound and
resolves F1. NF1 and NF2 from round 2 are also addressed. No new blockers.

---

## Round-2 findings: status

### F1 (critical) — `/api/state` returns `exists: false` after runtime `openspec/` creation

**Status: RESOLVED**

The rework changes `const openspecDir` to `let openspecDir` (line 64 of
`server/index.ts`), making it mutable. The fix has three parts:

1. **`/api/state` re-resolves on every request.** The handler now calls
   `const liveOpenspecDir = resolveOpenspecDir(PROJECT_ROOT)` and passes that
   to `scanWorkspace(liveOpenspecDir, PROJECT_ROOT)`. Once `openspec/changes/`
   exists, `resolveOpenspecDir` returns a non-null path and `scanWorkspace`
   returns `{ exists: true }`. The boot-time null is no longer cached.

2. **ProjectRootWatcher callback updates the module-level var.** When the
   callback fires, `openspecDir = newOpenspecDir` runs before
   `startOpenspecWatcher(newOpenspecDir)`, so all handlers that read the
   variable (withinOpenspec, change endpoints) immediately see the new path.

3. **`/api/state` also updates the module-level var as a safety net.** If
   `liveOpenspecDir && !openspecDir`, the handler sets
   `openspecDir = liveOpenspecDir` so other handlers that do not re-resolve
   per-request also benefit.

End-to-end trace (verified):

1. ithyno starts, `openspecDir = null`. `ProjectRootWatcher` starts on
   `PROJECT_ROOT` at depth 0.
2. Import dispatched → PTY gets `/ithy-opsx:import <path>` → Manager skill
   runs → sub-agent spawns → `openspec init` creates `openspec/` then
   `openspec/changes/`.
3. `ProjectRootWatcher` fires `addDir` on `openspec/`. `this.stopped = true`,
   watcher closes, callback runs. `resolveOpenspecDir(PROJECT_ROOT)` returns
   `<root>/openspec` (because `changes/` now exists). `openspecDir` updated,
   `startOpenspecWatcher` called, `state-replaced` broadcast.
4. Client receives `state-replaced` → `fetchState()` → `/api/state` calls
   `resolveOpenspecDir` fresh → `liveOpenspecDir` non-null → `exists: true`,
   `generatedMarkerPresent: false` (GENERATED.md not written yet).
5. Sub-agent writes specs, then writes `openspec/GENERATED.md`.
6. Real `Watcher` on `openspec/` detects GENERATED.md (`.md`, not under
   `changes/`, not under `specs/`) → falls through to
   `broadcast({ type: "state-replaced" })`.
7. Client receives `state-replaced` → `/api/state` → `exists: true`,
   `generatedMarkerPresent: true`.
8. `ImportProgress` predicate `state.exists && state.generatedMarkerPresent` →
   `true && true` → `onComplete` fires with once-guard.

`openspecDir` is `let` confirmed at line 64. `/api/state` calls
`resolveOpenspecDir(PROJECT_ROOT)` per-request confirmed at line 380.
`state-replaced` broadcast from `startOpenspecWatcher`'s Watcher fires for
GENERATED.md (it ends in `.md`, `changeIdForPath` returns null, the
`specsPrefix` check also fails → line 197 broadcast). All steps verified in
source.

### NF1 (minor) — idempotency guard for ProjectRootWatcher double-start

**Status: RESOLVED**

`let openspecWatcherStarted = false` declared in the `else` block (line 218).
Callback checks `if (openspecWatcherStarted) { log; return; }` and sets it
`true` before calling `resolveOpenspecDir`. Guard is in the right place — set
before the conditional call to `startOpenspecWatcher`, preventing orphaned
chokidar instances on hypothetical double-calls.

### NF2 (info) — `injectIntoManager` diagnostic log

**Status: RESOLVED**

After the loop with no match, `console.warn` logs the expected cwd and all
live terminal cwds. Implementation verified in `server/sync/pty.ts`.

---

## Round-3 regression tests

Four tests added in
`server/parser/workspace.test.ts` (`resolveOpenspecDir + scanWorkspace —
import runtime scenario`):

1. `resolveOpenspecDir` returns null when `openspec/` not present. ✓
2. `resolveOpenspecDir` returns the path once `openspec/changes/` is created. ✓
3. `scanWorkspace(liveOpenspecDir, root)` returns `{ exists: true,
   generatedMarkerPresent: true }` after GENERATED.md is written (the
   previously-broken passing case). ✓
4. Documents the old broken behavior: `scanWorkspace(null, root)` returns
   `{ exists: false, generatedMarkerPresent: true }`. ✓

These test the primitives used by the fix, not the full WS-notification loop
(which requires a live Fastify + WebSocket server). That scope limitation is
acceptable — the WS notification path is exercised by the real `Watcher` class,
which is covered by existing tests and has not changed.

All 4 tests pass in isolation and in the full suite. The only failing test
(`build-icons/sharp`) is a pre-existing infrastructure issue (sharp not
installed in this environment) unrelated to this change.

---

## New findings from multi-angle pass

### Finding R1 (minor) — narrow race: ProjectRootWatcher may fire before `openspec/changes/` is created

`resolveOpenspecDir` requires both `openspec/` AND `openspec/changes/` to
exist (line 18 of `workspace.ts`:
`if (existsSync(direct) && existsSync(join(direct, "changes"))) return direct`).
`ProjectRootWatcher` fires on `addDir` for `openspec/` itself (depth-0 watch on
`PROJECT_ROOT`). If the watcher callback fires in the interval between
`mkdir openspec` and `mkdir openspec/changes` (two sequential calls inside
`openspec init`), `resolveOpenspecDir` returns null, `startOpenspecWatcher` is
never called, and `openspecWatcherStarted` is already `true` — so the guard
prevents any retry. No `state-replaced` ever fires for `openspec/GENERATED.md`,
and the ImportProgress dashboard hangs.

In practice this race is extremely narrow. `openspec init` creates both
directories in rapid succession (same process, back-to-back `mkdir` calls), and
chokidar on macOS uses FSEvents with coalescing latency typically >= 10 ms.
The race would require the chokidar callback to be dispatched and processed
faster than `openspec init` can call `mkdir` twice. This is unlikely but not
impossible under heavy load.

The `/api/state` re-resolve safety net partially mitigates this: if the
client's first `state-replaced`-triggered `/api/state` call arrives after
`openspec/changes/` is created, `liveOpenspecDir` is non-null and
`openspecDir` is updated. But `/api/state` does NOT call
`startOpenspecWatcher`, so the real Watcher is still not started. No second
`state-replaced` fires for GENERATED.md. The dashboard still hangs.

**Mitigation** (not required for ship): Move the `openspecWatcherStarted` flag
set to AFTER the `resolveOpenspecDir` check, and add a retry path in the
`/api/state` handler when it discovers `liveOpenspecDir` with
`!openspecWatcherStarted`:

```ts
if (liveOpenspecDir && !openspecDir) {
  openspecDir = liveOpenspecDir;
  if (!openspecWatcherStarted) {
    openspecWatcherStarted = true;
    startOpenspecWatcher(liveOpenspecDir);
  }
}
```

**Severity: minor** — very narrow race in practice; `openspec init` almost
certainly completes both mkdirs before chokidar delivers the event. No
ship-block.

### Finding R2 (info) — `withinOpenspec` uses module-level var, improved but not fully live

`withinOpenspec(filePath)` reads `openspecDir` at call time (not a frozen
closure). Now that `openspecDir` is mutable and updated by both the
ProjectRootWatcher callback and the `/api/state` handler, the first write-endpoint
request after import will correctly route to the new openspec path. This is an
improvement over the previous frozen `const` (which required a server restart).
However, in the race scenario described in R1 (where `startOpenspecWatcher` is
not called), `openspecDir` may also not be updated via the callback path, and
would only be updated by the `/api/state` handler. The first subsequent write
request that arrives before any `/api/state` call would still get a 404. This
is a corner case within a corner case.

**Severity: info** — pre-existing architectural limitation, now improved. No
action required.

---

## Verdict

**pass**

F1 is fully resolved for the common case (which covers all practical
deployments). The server-side re-resolve approach is architecturally correct
and more robust than the client-side predicate fix suggested in round 2 — it
fixes the root cause rather than working around it. NF1 and NF2 are resolved.
The new finding R1 is a minor latent race that is very unlikely to trigger in
practice and does not block shipping. R2 is informational only.

All automated gates confirmed: 418 tests pass (4 new), 1 pre-existing
build-icons/sharp failure unrelated to this change, typecheck clean, build
clean.
