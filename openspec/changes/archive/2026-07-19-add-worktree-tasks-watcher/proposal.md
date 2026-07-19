---
tags: [feature/agent-runner, feature/kanban, area/server, area/web]
---

## Why

`add-agent-pty-runner` gave us TTY-detecting CLIs. That let us switch
Claude Code to **print mode (`-p`)** in `agents.yaml`, which side-steps
the paste-detection heuristic that kept `/opsx:apply` from firing under
stdin injection. It works — files land in the worktree, agents run to
completion.

The cost: **print mode is silent by design.** No progress lines, no
tool-use narration, no spinners land in the ring buffer. The Agents
page's terminal stays blank until Claude prints its final summary at
the end. From the user's point of view, a running agent looks
indistinguishable from a stuck one for tens of minutes at a time.

The truth about progress is already being written — Claude ticks
tasks in the change's `tasks.md` as it completes them. That file lives
inside the agent's worktree
(`.worktrees/<change-id>/openspec/changes/<change-id>/tasks.md`),
which the current dashboard watcher **does not watch** (it only
watches the main tree's `openspec/`).

Watching the worktree copy of `tasks.md` while a job runs turns
silence into a clear "3/40 → 4/40 → …" progress signal, restoring the
Kanban card's progress bar as an honest indicator of what's happening
right now.

## What Changes

- **Per-job tasks watcher**: when the runner spawns an agent, it
  starts a lightweight file watcher on
  `.worktrees/<change-id>/openspec/changes/<change-id>/tasks.md`.
  When the file changes, the runner re-parses it, computes
  `{ done, total }`, and emits a new WebSocket event.
- **Watcher lifecycle**: the watcher is tied to the job. It stops on
  every terminal transition (`completed`, `crashed`, `cancelled`), and
  on server shutdown. No zombies.
- **New WS event `worktree-progress-updated`**:
  `{ jobId, changeId, progress: { done, total } }`. Broadcast on
  every re-parse that changes progress.
- **Store gains `worktreeProgress: Record<changeId, Progress>`**. It
  is updated by the WS event. It clears when a job finishes (server
  emits one final event with the final progress; the client keeps
  displaying that until the worktree is merged/discarded).
- **Kanban card**: when a change has an active job AND
  `worktreeProgress[changeId]` is present, that value drives the
  progress bar and the `N/M` count. Otherwise the existing
  main-tree progress applies. The card reads "3/40 (worktree)" or
  similar so the source is transparent.
- **No change to the main-tree watcher**. The main tree's
  `openspec/` continues to be the source of truth for non-running
  changes; only running changes prefer the worktree signal.

## Capabilities

### New Capabilities
<!-- none — extending an existing capability -->

### Modified Capabilities
- `agent-runner`: each running job now carries a per-worktree tasks
  watcher; the runner emits `worktree-progress-updated` events so the
  UI can reflect implementation progress even when the agent (`-p`
  mode or otherwise) emits no output to the transcript

## Impact

- **`server/agents/runner.ts`**: new `WorktreeTasksWatcher` type held on
  each `Job`; started in `run()` after spawn; stopped in the exit /
  cancel path.
- **New helper `server/agents/worktree-progress.ts`**:
  - Constructs a `chokidar.watch` on the worktree tasks.md path
  - Uses `parseTasks(filePath, content)` from `server/parser/tasks.ts`
    (same parser as the main watcher — reuse guarantees the two
    progress counts stay in sync semantically)
  - Debounces file events (~200ms) — a single edit from Claude can
    fire several fs events on macOS
  - Emits progress only when `done` or `total` changed vs. the last
    emitted value (drop no-op re-parses)
- **`server/index.ts`**: broadcaster union gains
  `{ type: "worktree-progress-updated"; jobId; changeId; progress }`.
- **`web/src/types.ts`**: mirror the event shape and the
  `worktreeProgress` store slice type.
- **`web/src/store.ts`**: handle the new WS event; keep a
  `worktreeProgress` map; expose a small selector helper.
- **`web/src/components/Kanban.tsx`**: `ChangeCard` prefers
  `worktreeProgress[change.id]` when a running job exists for the
  change.
- **Docs**: `docs/architecture/parallel-shells.md` — one paragraph
  under the "Answering agent prompts from the UI" section explaining
  that progress is watched from the worktree tasks.md so `-p` mode
  agents don't look stuck.
- **Tests**: a small unit test for the debouncer + change-detection
  logic in `worktree-progress.ts` (parse two versions of a tasks.md
  string, verify emission gating).

## Out of scope

- **Watching every file in the worktree** as a heartbeat. Overkill;
  tasks.md changes are the signal that carries meaning.
- **Reflecting per-task detail** (which specific 1.1 / 1.2 got
  ticked). The card already shows `done/total`; the change detail
  page can render the delta when the user drills in.
- **Persisting `worktreeProgress` across page reloads**. Store starts
  empty on reload; the next tick from the running job re-populates.
  If no more ticks come (job already done and about to be
  merged/discarded), the last-known progress is lost until archive.
- **Sub-second polling** as a fallback. If chokidar misses events on
  some filesystem, we address it as a bug there rather than adding a
  polling loop.
- **Cross-change dependencies** in the display. A change's progress
  is only informed by its own tasks.md.
