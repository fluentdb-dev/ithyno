## Context

Since we switched Claude Code to `-p` mode, the agent's PTY stream is
silent for the entire implementation window. The transcript stays
empty until Claude prints its final result and exits. Users lose the
visceral signal — the progress bar, the ticked checkbox — that told
them work was happening.

But the work IS happening on disk, and OpenSpec's own conventions
already tell us where to look: `tasks.md` gets `[x]`-ed as tasks
complete. Every agent that respects the OpenSpec workflow updates that
file. We can watch it directly.

The catch is that the file lives in the worktree, not the main tree.
The main-tree watcher (installed by the base runner) never sees these
edits.

## Goals / Non-Goals

**Goals:**
- Progress is visible in the Kanban card while a job runs, driven by
  the worktree's `tasks.md`, not by whatever the agent chose to print.
- Zero extra load when no jobs are running.
- Reuse the existing `parseTasks` implementation so worktree progress
  and main-tree progress have identical semantics.

**Non-Goals:**
- Watching arbitrary worktree files (heartbeat mode).
- Streaming per-task detail to the browser.
- Polling as a fallback.
- Cross-tab locking of progress state.

## Decisions

### One watcher per running job

The runner already tracks jobs in a `Map<jobId, Job>`. Each job gains
a `worktreeTasksWatcher: FSWatcher | null` field. It is created in
`run()` right after the pty spawn succeeds, and disposed in `finish()`
alongside the other per-job resources.

Rejected alternative: **one watcher for `.worktrees/`** that dispatches
to whichever change matched by path. Simpler in setup, more complex in
teardown (removing a specific change's watcher subtree turns into
patch-and-diff logic on the watch list). Per-job is easier to reason
about and matches the runner's existing bookkeeping shape.

### Chokidar for the watcher, reusing the project's dependency

`chokidar` is already installed and is what `server/sync/watcher.ts`
uses for the main-tree watcher. No new dependency; consistent behavior
across platforms.

### Path shape

Watch exactly the tasks.md file, not the whole worktree directory:

```
.worktrees/<change-id>/openspec/changes/<change-id>/tasks.md
```

- Cheaper (one file, not a subtree walk).
- The only file we consume is that one; nothing else on disk needs
  reactive interpretation.
- If a change's directory hasn't been created yet in the worktree
  (rare — Claude sometimes deletes and recreates), chokidar's
  `add`/`unlink` events will re-arm; we tolerate that with a
  short-lived retry.

### Debounce + change-detection

- Debounce raw fs events by ~200 ms (mac fs events fire twice for
  many editor writes).
- After debounce, re-parse the file with `parseTasks`.
- Compare `{done, total}` against the last emitted pair for this job.
  If equal, drop; otherwise emit.

This turns a hail of fs events into at most a few emissions per
second, and it drops re-emits that don't actually move the needle.

### WebSocket event shape

```ts
| { type: "worktree-progress-updated"; jobId: string; changeId: string; progress: { done: number; total: number } }
```

Reuses the existing `wss` broadcast pipe. The event is idempotent —
the client applies the last-received value; no ordering constraints
beyond what the transport already gives us.

### Client display

- `useStore` gains `worktreeProgress: Record<string, Progress>` keyed
  by `changeId`.
- `ChangeCard` in `Kanban.tsx` picks its progress source as:
  1. If a job for this change is running and
     `worktreeProgress[changeId]` exists → use it.
  2. Else fall back to `change.progress` (main-tree parse).
- Label: `"X/Y (worktree)"` when the worktree source is in use, so
  users can tell where the count comes from without having to open
  the change detail.

### Cleanup semantics

- When the runner's `finish()` runs (status transitions to a terminal
  state), the runner emits **one last** `worktree-progress-updated`
  with the final parse result. Then it disposes the watcher.
- The store keeps `worktreeProgress[changeId]` until the user merges
  or discards. At merge/discard we clear it — post-merge, the main
  tree carries the same information and `change.progress` becomes
  authoritative again.

Rejected alternative: **clear on job exit**. Wrong UX — the user is
about to review the finished worktree; they should see the same
number they were watching converge to.

## Alternatives considered

- **Polling worktree tasks.md every N seconds**. Rejected: adds
  constant load; chokidar already handles this correctly.
- **Parsing `git status --porcelain` per second as a heartbeat**.
  Rejected: fires on any file change, not just tasks completion; noisy
  and doesn't tell the user how far along the agent is.
- **Streaming diffs of tasks.md to the browser**. Overkill for a
  progress bar; the client only needs `{done, total}`. Diff lives in
  the Diff tab and doesn't need to be live.
- **Not doing this and telling users "just wait"**. The dashboard's
  whole reason to exist is to make async work legible. This is a bug
  in that promise, not a docs issue.

## Risks

- **Chokidar reliability on unusual filesystems**. Same risk the main
  watcher already faces. If we ever discover it fails in a real user
  setup, we can layer a polling fallback then, per-project.
- **Parse cost**. `parseTasks` walks the markdown AST; for a tasks.md
  with a few dozen items this is sub-millisecond. Debouncing amortizes
  even worst-case rapid edits.
- **Race: watcher armed before file exists**. Some agents may
  briefly delete-and-recreate `tasks.md`. Chokidar's
  `ignoreInitial: false` + retry-on-add covers this; we handle both
  `add` and `change` in the same handler.
- **Store slice size**. `worktreeProgress` is a small object keyed by
  changeId; even with hundreds of changes it's noise compared to the
  existing `jobOutputs` accumulation.
