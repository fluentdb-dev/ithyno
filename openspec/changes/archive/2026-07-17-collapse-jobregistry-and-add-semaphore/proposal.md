---
tags: [feature/kanban, feature/dispatch, area/web, area/server, area/skills, runtime-collapse-followup, folder-driven, semaphore]
---

# Collapse job registry to folder state, add `.worktrees/.lock` semaphore

## Why

The live verify of `/ithy-opsx:dispatch add-dummy-tab` (see
`archive/2026-07-17-redesign-skill-namespace-and-dispatch/outcome.md`)
surfaced two design gaps:

1. **Kanban placement is job-registry-dependent.** Even though the
   dispatch chain successfully spawned a worktree, ran code (Task
   tool) and review (copilot subprocess), the Kanban card stayed in
   TODO. The `bucketize` function gates IN-PROGRESS on
   `jobByChange.get(id)?.status === "running"`, but Task-tool
   subagents and CLI subprocesses never touch `POST /api/agents/run`
   — they don't register jobs. Runtime-collapse philosophy wanted
   the server to shrink to a facade; the placement gate is a
   remnant of the pre-collapse world.

2. **`parallelExecution: false` has no single-concurrency gate.**
   The flag was added by `add-parallel-execution-config` to control
   whether worktrees are spawned, but nothing prevents starting a
   second change while a first is still active in the main tree.
   For `parallelExecution: false` (single-tenant mode), the user
   should not be able to dispatch a second change until the first
   is merged or discarded.

Both gaps share a root cause: **state that the dashboard needs is
in filesystem, but the dashboard reads it via the API/job-registry
layer**. Collapsing to a folder-driven view (with a semaphore file
for the concurrency case) resolves both.

## What Changes

### 1. Kanban placement is folder-driven

`bucketize` (`web/src/components/Kanban.tsx`) stops gating on
`jobByChange` and instead uses filesystem state exposed by the
server:

```
placement(change X):
  if archive/*-X exists                   → DONE
  elif .worktrees/X/openspec/changes/X/tasks.md → all-done          → DONE
  elif .worktrees/X/ exists                                          → IN-PROGRESS
  elif main-tree openspec/changes/X/tasks.md → all-done              → DONE (rare, phase updated without worktree)
  elif progress.done > 0                                             → IN-PROGRESS
  else                                                                → TODO
```

Server state exposes `hasWorktree: boolean` per change (an existing
signal? checked at server boot). Client's `Change` type gains
`worktree?: { path, branch, tasksProgress }` populated at load time.

### 2. Progress source: worktree first, main second

For each change `X`, progress is read from:
- **`worktree/X/openspec/changes/X/tasks.md`** if the worktree exists
- Else main tree `openspec/changes/X/tasks.md`
- Else archive `openspec/changes/archive/*-X/tasks.md` (DONE)

Never read change `Y`'s tasks.md from change `X`'s worktree (which
holds a frozen snapshot — not the live state).

### 3. Live update: file-driven, not job-driven

`worktreeProgress` in the client store is populated by:
- Server-side `chokidar` watching
  `.worktrees/*/openspec/changes/*/tasks.md` (glob)
- Emit `worktree-progress-updated` WS event on file change
- The `add-worktree-tasks-watcher` mechanism is retained but its
  trigger changes: no longer needs a job to attach — always watches
  once a worktree appears

### 4. `.worktrees/.lock` semaphore for `parallelExecution: false`

New file at `.worktrees/.lock` (only created when needed):

```yaml
change: add-dummy-tab
acquiredAt: 2026-07-17T13:24:00Z
pid: null           # Task-tool spawn has no process handle
```

- **Acquire**: `/ithy-opsx:dispatch` (step 4, worktree bootstrap)
  reads `agents.yaml.parallelExecution`. If `false`:
  - If `.worktrees/.lock` exists AND its `change` still has a live
    worktree → refuse to proceed, escalate:
    `Another change (<held-change>) is currently running. Merge or
    discard it before starting another.`
  - If `.worktrees/.lock` exists but its `change`'s worktree is
    missing → treat as **stale**, delete the lock, proceed.
  - Otherwise: write the lock file, proceed with worktree setup.

- **Release**: three paths:
  1. Dispatcher's step 7 verify pass (phase → done) — delete lock.
  2. Dispatcher's escalate path — delete lock (dispatcher is done
     with this change, even if unsuccessfully).
  3. Kanban's Merge / Discard action — delete lock after the
     worktree/branch cleanup.

- **Server startup cleanup**: on boot, scan `.worktrees/.lock` and
  if the referenced `.worktrees/<change>/` doesn't exist, delete
  the lock. Prevents stale locks from earlier crashed processes.

### 5. Client Start gate

`useStartFlow` reads `parallelExecution` + `.worktrees/.lock` state
(exposed via server broadcast) and gates the Start button:

```
if parallelExecution === false && lock is held by another change:
  Start button disabled
  Tooltip: "Change `<held-change>` is currently running. Merge or
           discard it first."
elif parallelExecution === false && lock held by this same change:
  Start button acts as "Attach" (reopen terminal, no new worktree)
else:
  Start button injects /ithy-opsx:dispatch <id> normally
```

### 6. Diff view / Merge / Discard actions: fs-based

Currently these go through `job.workspacePath`. Post-change, they
compute the worktree path directly from change id:
`.worktrees/<id>/`. No job needed.

### 7. Live streaming demotion (out-of-scope for this change)

`POST /api/agents/run` (spawn agent + register job + stream via WS)
stays as-is for the users who explicitly want to attach a running
PTY to the dashboard. It becomes optional — used by the "Attach"
action, not by dispatch. **Not touched by this change**; tracked as
follow-up.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Dispatch Slash Command` — add `.worktrees/.lock`
  acquire/release semantics, add `parallelExecution: false` gate
  check at step 4 (worktree bootstrap).
- **MODIFIED** `Start Flow Delegates Execution To Skill Layer` —
  Kanban Start button reads lock state, disables when lock is held
  by another change (parallelExecution=false only).
- **ADDED** `Kanban Placement Is Folder-Driven` — new requirement
  documenting the placement algorithm.
- **ADDED** `Worktree Concurrency Semaphore` — new requirement
  documenting the `.worktrees/.lock` file contract, acquire /
  release paths, and stale cleanup.

## Impact

- **Affected specs**: `dashboard` (2 MODIFIED, 2 ADDED)
- **Affected code**:
  - `web/src/components/Kanban.tsx` (`bucketize` rewrite)
  - `web/src/types.ts` (`Change` gains `worktree?` field)
  - `web/src/store.ts` (WS handlers for the new events)
  - `server/model.ts` + `server/parser/workspace.ts` (populate
    `worktree` field when workspace scans)
  - `server/agents/worktree-watcher.ts` (chokidar glob change)
  - `.claude/commands/ithy-opsx/dispatch.md` (lock acquire/release
    steps)
  - `web/src/hooks/useStartFlow.tsx` (lock-based gate)
  - `server/index.ts` (startup lock cleanup, possibly broadcast
    lock state via WS)
- **Risk**:
  - Concurrent Kanban clients might race on lock — but since only
    one dispatcher can hold the lock at a time and both check
    filesystem, race collapses to "first-writer wins" with the
    later attempt seeing the already-held lock.
  - Stale lock cleanup relies on `.worktrees/<change>/` presence
    check. If a user manually deletes the worktree via `git
    worktree remove` without also deleting the lock, the next boot
    fixes it. Acceptable.
  - `worktreeProgress` from folder watch replaces job-driven
    update; existing consumers must switch cleanly. Server tests
    cover the watcher.
- **Migration**: none. `agents.yaml` schema unchanged.
  `.worktrees/.lock` is new but optional (only appears in
  `parallelExecution: false` sessions).
