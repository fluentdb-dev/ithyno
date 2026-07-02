## ADDED Requirements

### Requirement: Per-Job Worktree Tasks Watcher
The agent runner SHALL install a per-job filesystem watcher on the
worktree's `tasks.md` when a job starts, and SHALL emit a
`worktree-progress-updated` WebSocket event whenever the parsed
`{done, total}` for that file changes, so the dashboard can display
implementation progress even when the agent's PTY output is silent
(e.g. Claude Code running in print mode).

#### Scenario: Watcher starts on job spawn
- **WHEN** the runner successfully spawns an agent for change `<id>`
- **THEN** it starts a chokidar watch on `<projectRoot>/.worktrees/<id>/openspec/changes/<id>/tasks.md` and stores the watcher handle on the job entry

#### Scenario: Watcher stops on any terminal transition
- **WHEN** the job status transitions to `completed`, `crashed`, or `cancelled`
- **THEN** the watcher is disposed as part of the `finish()` path; a stopped or missing watcher is a no-op

#### Scenario: One final emission before stop
- **WHEN** the runner's `finish()` runs
- **THEN** it emits one last `worktree-progress-updated` event with the current parse result before disposing the watcher; the client keeps that value on screen until merge/discard

#### Scenario: Watcher stops on server shutdown
- **WHEN** the runner's `shutdown()` runs
- **THEN** every active watcher is disposed alongside the SIGTERM of every child PTY

### Requirement: Change-Gated Emission
The runner SHALL debounce raw filesystem events by at least 150 ms and
SHALL only broadcast a `worktree-progress-updated` event when the
parsed `{done, total}` differs from the last-broadcast value for that
job, so noisy filesystem event streams do not produce redundant WS
traffic.

#### Scenario: Duplicate parse produces no emission
- **WHEN** the file is re-parsed after a debounce window and the result matches the previously-emitted `{done, total}`
- **THEN** no event is emitted

#### Scenario: `done` counter increment emits
- **WHEN** the file is re-parsed and `done` increased
- **THEN** an event is emitted with the new `{done, total}`

#### Scenario: `total` change emits
- **WHEN** the file is re-parsed and `total` changed (task list edited during work — rare but possible)
- **THEN** an event is emitted with the new pair

### Requirement: WebSocket Event Shape
The system SHALL broadcast `worktree-progress-updated` events with the
following payload shape so clients can update state without needing to
join it against other sources.

```
{ type: "worktree-progress-updated"; jobId: string; changeId: string; progress: { done: number; total: number } }
```

#### Scenario: Payload is self-contained
- **WHEN** a client receives the event
- **THEN** it has enough data (`jobId`, `changeId`, `progress`) to update its `worktreeProgress` map without fetching anything else

### Requirement: Kanban Card Prefers Worktree Progress When Running
The Kanban `ChangeCard` SHALL display the worktree-derived progress
when a change has a running or post-run (pending merge/discard) job
AND a `worktreeProgress[changeId]` entry exists; otherwise it SHALL
fall back to the main-tree parse `change.progress`.

#### Scenario: Running job with worktree signal
- **WHEN** a change has a running job and `worktreeProgress[changeId]` is `{ done: 3, total: 40 }`
- **THEN** the card renders `3/40` with a "(worktree)" hint

#### Scenario: No worktree signal yet
- **WHEN** the running job has emitted no `worktree-progress-updated` events yet
- **THEN** the card falls back to `change.progress`

#### Scenario: Completed but not yet merged
- **WHEN** the job has transitioned to `completed` and the store still holds `worktreeProgress[changeId]`
- **THEN** the card continues to display the worktree value until merge or discard clears it

#### Scenario: Post-merge / post-discard clear
- **WHEN** the user merges or discards the job
- **THEN** the client clears `worktreeProgress[changeId]` and the card returns to `change.progress` (which is now updated by the main-tree watcher)
