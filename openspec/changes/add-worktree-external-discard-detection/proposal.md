---
tags: [feature/worktree, feature/agents, area/server, area/web]
---

## Why

When the user runs `git worktree remove <path>` directly from a
terminal (or an editor's git panel, or `bin/clean-worktrees.sh`, or
any other out-of-UI removal), the OpenSpec UI Kanban card **stays in
the "in-progress" column** as if the agent worktree were still alive.
The only workaround is to restart the server, at which point the
runner's on-startup `adoptOrphanWorktrees()` sweep sees no directory
and doesn't re-adopt the ghost job.

The current watcher — landed by `add-worktree-tasks-watcher` — is
listening on `tasks.md` for `add` and `change` events (so the progress
bar advances as the agent ticks tasks) but ignores the `unlink` event
that chokidar emits when the file disappears. So the watcher has all
the information it needs to detect an external removal; it just
doesn't act on it.

Meanwhile the newer `add-agent-start-proposal-guard` closes the
uncommitted-proposal footgun at Start time. This change closes the
symmetric footgun at Discard time — the two changes together mean the
Kanban card state stays honest across the full Start ⇒ Discard round
trip regardless of whether the user drove it from the UI or from a
terminal.

## What Changes

### Server: worktree watcher extension

- `server/agents/worktree-progress.ts::startWorktreeProgressWatcher`
  gains an `onUnlink?: () => void` option. The chokidar watcher then
  listens for `unlink` on the watched `tasks.md` and fires the
  callback (once; the watcher self-disposes after the first fire since
  the file it was tracking is gone).
- No change to the `add` / `change` handlers or the debounced progress
  emitter — this is purely additive.

### Server: runner reaction to unlink

- `server/agents/runner.ts` — wherever the runner attaches the
  progress watcher (both fresh-spawn and orphan-adoption paths), it
  supplies an `onUnlink` callback that:
  1. Removes the job from `this.jobs` and `this.locks`.
  2. Disposes the (already-terminating) progress watcher handle so
     nothing lingers in `job.worktreeTasksWatcher`.
  3. Broadcasts a new `agent-job-removed` WS event.

### Server: new WS event type

- New event `agent-job-removed { jobId: string; changeId: string }`
  in the `ServerEvent` union in `server/index.ts`. Fires only from the
  external-removal path; UI-driven Discard flows continue to use the
  existing `agent-job-finished` transition.

### Client: store reaction

- `web/src/store.ts` — on `agent-job-removed`, delete `jobs[jobId]`,
  `jobOutputs[jobId]`, and clear `worktreeProgress[changeId]`.
- On the next render, the Kanban card's `bucketize` no longer sees
  any job for that change and drops it back to the TODO column
  (progress = 0 for a fresh un-run change, or its main-tree
  `change.progress` for changes with pre-existing ticks).

## Capabilities

### Modified Capabilities

- `dashboard`: the Kanban's agent-job state now stays consistent when
  a worktree is removed outside the UI (terminal `git worktree
  remove`, editor git panels, etc.). The card returns to TODO
  automatically instead of requiring a server restart.

## Impact

- `server/agents/worktree-progress.ts` (add `onUnlink` option +
  `watcher.on("unlink", ...)`)
- `server/agents/runner.ts` (supply `onUnlink` in both watcher
  attachment sites; new job-removal helper method)
- `server/index.ts` (add `agent-job-removed` to the WS event union)
- `web/src/store.ts` (handle `agent-job-removed`)
- No client-side render changes required — existing Kanban
  bucketization already produces the right column once the job is
  gone.

## Out of scope

- **Watching `.worktrees/` directly** for arbitrary child directory
  removals. Rejected as heavier than needed: the existing per-job
  watcher on `tasks.md` already gives us a signal for each active job
  at zero incremental cost. A directory-level watcher would fire for
  unrelated changes (agent's own file edits) and require path
  filtering.
- **Distinguishing "removed by us" from "removed by the user"** in
  the runner. Not needed for the UI outcome; both cases end up with
  the same "drop the job" behavior. The UI-driven Discard already
  disposes its own watcher before removing, so `onUnlink` fires at
  most once per job regardless of who removed it.
- **Retroactively cleaning up dangling agent branches** when a
  worktree was removed but the branch wasn't (`git branch -D
  agent/<id>` step). Out of scope; a future `sync-agent-branches`
  helper can handle that.
- **New status like `"discarded"` on `JobStatus`.** Simpler to just
  drop the job entirely — it never existed on this session's server
  from the user's perspective. Client UI treats "no job for this
  change" as "TODO", which is the desired outcome.
