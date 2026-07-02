---
tags: [feature/agent-runner, feature/kanban, area/server, area/web]
---

## Why

`.worktrees/<change-id>/` directories persist across server restarts.
The runner's in-memory job map does not — a restart wipes it. That
combination produces a stuck state that is actually common:

- Server restart during a run (any `dev` server-file save,
  `dev:test` explicit restart, laptop reboot)
- Manual `git worktree add` from the command line
- Agent process crashed but left the worktree behind

Today the Kanban card for such a change reverts to TODO — no job, no
Merge/Discard button, no way to interact with the worktree from the
UI. The user has to drop to a terminal to `git merge --no-ff` and
`git worktree remove` by hand. That's not a bug that shows up under
exotic conditions; it's the default outcome of any restart during
run.

The worktree is not "lost." It's on disk with real, uncommitted or
committed work. The dashboard just needs to acknowledge it.

## What Changes

- **Server startup adopts on-disk worktrees.** After `agentRunner` is
  constructed, it runs `git worktree list --porcelain`, filters to
  entries under `<projectRoot>/.worktrees/` whose branch matches
  `agent/<change-id>`, and inserts a synthetic `Job` for each with
  **`status: "orphaned"`**.
- **New `JobStatus` value `"orphaned"`.** Its semantics are "the
  worktree exists, we don't know if a process is running; Merge and
  Discard are available exactly as they are for finished jobs."
  Cancel is not available (no process handle to signal).
- **`worktreeTasksWatcher` attaches to orphaned jobs the same way it
  does to fresh spawns**, so the Kanban card's progress bar reflects
  the worktree's current tick state — restoring the "3/40 → 4/40"
  feedback the user lost with the restart.
- **Kanban card treats "orphaned" as mergeable / discardable.**
  `isMergeable()` and the `hasNonVerifyWork` gates already accept
  "any non-running post-run state" for those actions; the value
  `"orphaned"` slots in.
- **Card badge.** An `Orphaned` label appears next to the change id
  so the user sees at a glance that this card was adopted from disk,
  not started in this server lifetime.
- **No new writes on adoption.** The runner does not spawn anything,
  does not touch git state, does not modify the worktree. It only
  inserts a job record and starts the progress watcher.

## Capabilities

### New Capabilities
<!-- none — modifies the existing agent-runner capability -->

### Modified Capabilities
- `agent-runner`: on startup, worktrees under `.worktrees/` whose
  branch prefix is `agent/` are adopted into the runner's job map
  with a new `orphaned` status; the Kanban card exposes Merge and
  Discard for them the same way it does for finished jobs

## Impact

- **`server/agents/runner.ts`**:
  - `JobStatus` union widens to `"running" | "completed" | "cancelled" | "crashed" | "orphaned"`.
  - New method `adoptOrphanWorktrees()`: parses `git worktree list --porcelain`, filters, inserts jobs, attaches the worktree tasks watcher, emits `agent-job-started` for each.
  - `cancel()` refuses `orphaned` jobs (no process handle) with a clear reason.
  - `writeInput()` refuses `orphaned` jobs similarly.
  - The existing `latestJobForChange()` treats `"orphaned"` the same as `"completed"` for the "is this change mergeable?" question the UI asks.
- **`server/index.ts`**: after the `agentRunner = new AgentRunner(...)` line, `await agentRunner.adoptOrphanWorktrees()` before wiring the WebSocket server. Startup order matters — clients that subscribe to WS after this see the adopted jobs via the initial `/api/agents/jobs` fetch.
- **New helper `server/agents/adopt-orphans.ts`**: encapsulates the `git worktree list --porcelain` parse. Keeps `runner.ts` legible.
- **`web/src/types.ts`**: `JobStatus` widened to match server.
- **`web/src/components/Kanban.tsx`**:
  - `isRunningOrPending` and `isMergeable` acknowledge `"orphaned"` (still-actionable state, no process).
  - `ChangeCard` renders an `Orphaned` badge next to the agent name when the job's status is `"orphaned"`.
  - Cancel button is hidden for orphaned jobs; Merge / Discard shown.
- **No client-side merge/discard changes.** The existing
  `useStartFlow` and `Kanban` merge/discard flows use `job.branch`
  and `job.worktreePath` — both are already recorded on the synthetic
  job.
- **Docs**: `docs/architecture/parallel-shells.md` gains a paragraph
  under "Live progress from the worktree" explaining orphan adoption.

## Out of scope

- **Adopting live processes.** That's `add-agent-process-detach`'s
  job, via meta files. Orphan adoption here is worktree-level only —
  we do not attempt to reconnect to a live pid, do not tail any
  process log, do not resume interactive stdin. If the same change
  ends up covered by BOTH a detach meta file AND an on-disk worktree,
  the detach adoption wins (meta file has more information).
- **Auto-merging orphans.** Adoption gives the user the Merge/Discard
  affordance; the user still confirms.
- **Preserving output history.** Orphaned jobs have no `output`
  entries — the ring buffer was in the previous server's memory and
  did not survive. The Diff tab remains authoritative for what was
  written to the worktree.
- **Handling worktrees on other branches.** Only `agent/<change-id>`
  is adopted. Manually-created worktrees on arbitrary branches are
  ignored (they are the user's, not the runner's).
