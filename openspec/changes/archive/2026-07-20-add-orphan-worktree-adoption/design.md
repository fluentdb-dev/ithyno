## Context

Restarting the dashboard server is a routine event (dev iteration,
laptop wake, session change). Restarting the runner does not undo the
worktrees the runner created — they persist under `.worktrees/`. The
gap between what's on disk and what the runner knows about is exactly
the "stuck TODO card with real work behind it" state we hit.

This change closes that gap with the smallest possible lift: **look
at what git already tells us, and adopt the entries into the runner's
job map with an honest label**.

## Goals / Non-Goals

**Goals:**
- After any server startup, `.worktrees/<change-id>/` entries with
  branch `agent/<change-id>` appear as jobs the Kanban card can act
  on.
- The action set is precisely Merge and Discard — no fabrication of
  Cancel or Retry that we cannot honor.
- The progress bar reflects the worktree's tasks.md via the existing
  watcher.

**Non-Goals:**
- Reconnecting to any process (that's `add-agent-process-detach`).
- Replaying pre-restart transcript output (the ring buffer is gone;
  the file diff is authoritative).
- Adopting worktrees whose branch is not `agent/<change-id>` (those
  are the user's own; leave them alone).

## Decisions

### New `JobStatus` value: `"orphaned"`

Rather than reusing `"completed"` or `"crashed"`, we introduce
`"orphaned"` as the honest label. It answers three UI questions
correctly:

- **Can you Merge?** Yes — the worktree has a branch we can merge.
- **Can you Discard?** Yes — we can `git worktree remove` + `git branch -D`.
- **Can you Cancel?** No — there is no process handle. The Cancel
  button hides.

Reusing `"completed"` would falsely promise the job succeeded.
Reusing `"crashed"` would falsely promise there was a run that failed.
`"orphaned"` says only what we know.

### Data source: `git worktree list --porcelain`

Cheaper and more reliable than scanning `.worktrees/` ourselves:

- Handles the case where `.worktrees/<id>/` was `rm -rf`'d without
  `git worktree remove --force` (git knows about the phantom entry).
- Reports the branch as HEAD, so we can filter by prefix.
- One invocation covers all changes.

We match on `branch = "refs/heads/agent/<x>"` AND
`worktree` path prefix under `<projectRoot>/.worktrees/`. Either alone
would produce false positives (a manual `git worktree add
../elsewhere agent/foo` shouldn't be adopted).

### Adopting once, at startup

Do not watch `.worktrees/` for new adoptions during a session. Fresh
worktrees during the session are created BY the runner's `run()`
call, which produces a normal `Job` entry directly. Additional
`.worktrees/` entries during a session would have to come from user
CLI activity — which we treat as intentional and out-of-scope.

### Worktree tasks watcher on orphans

Attach `worktreeTasksWatcher` on adoption. This is the same watcher
`add-worktree-tasks-watcher` introduced. The Kanban card's progress
bar therefore reflects the worktree's tasks.md, even though the
process that wrote those ticks is long gone.

If the worktree gets edited outside the dashboard (user opens their
editor and ticks a task manually), the card updates.

### Cancel and interactive input for orphans

- `cancel(id)` returns `{ ok: false, reason: "Orphaned worktree has no process to cancel — Discard or Merge instead." }`
- `writeInput(id, ...)` returns HTTP 409 with a matching reason

Neither affordance shows up in the UI for `"orphaned"` status; the
server responses are the "belt" catching a manual API call.

### Interaction with `add-agent-process-detach`

`add-agent-process-detach` adopts jobs whose meta file records an
alive PID. `add-orphan-worktree-adoption` adopts jobs whose meta file
is missing (or was never written). They walk the same disk in
different directions.

Order at startup:
1. `adoptDetached()` — meta-file-based, produces `running` jobs
2. `adoptOrphanWorktrees()` — worktree-list-based, produces
   `orphaned` jobs, but ONLY for changes not already covered by (1).

Neither change requires the other; they compose cleanly.

### Badge and visual

`ChangeCard` renders an `Orphaned` badge next to the agent name for
`status: "orphaned"` jobs. Same slot the `Running` badge uses; the
label is different. The Discard button is styled the same as it is
for any post-run worktree — no special "danger" treatment beyond the
existing modal confirmation.

## Alternatives considered

- **Auto-merge every orphan on startup**. Rejected: silent merge of
  unfinished work is dangerous and reduces user agency.
- **Adopt only worktrees whose `agent/<id>` branch actually has
  commits**. Considered; rejected. Even a branch with no commits but
  uncommitted work in the worktree is worth surfacing (the user can
  Discard it or manually commit first).
- **Delete stale worktrees at startup instead of adopting**. That's
  what `clean:worktrees` already does when the user chooses to. The
  default should not be destructive.
- **Surface orphans via a separate "Orphaned" list, not the Kanban**.
  Two lists split attention. The Kanban card is the natural home; a
  badge distinguishes state.

## Risks

- **Two-directory worktree**. Someone might have manually created a
  worktree AT `.worktrees/foo/` on branch `agent/foo` for their own
  reasons. On adoption we'd claim it as a change-managed worktree
  and expose Merge/Discard. Impact is low (both actions are still
  valid git operations on that branch), and the branch prefix
  convention is explicit enough that this is unlikely by accident.
- **Race with fresh spawn**. If a user clicks Start for change
  `<id>` at the exact moment the server just adopted an orphan for
  `<id>`, we'd end up with two jobs for the same change. Guard: the
  runner's existing `locks: Map<changeId, jobId>` blocks the second
  entry; the fresh spawn returns 409. Documented; the user re-tries
  after Discard.
- **`git worktree list` parsing rot**. `--porcelain` output format
  is stable across recent git; if a version emits differently the
  helper falls back to skipping the entry rather than crashing. Unit
  test the parser against the known-good format.
