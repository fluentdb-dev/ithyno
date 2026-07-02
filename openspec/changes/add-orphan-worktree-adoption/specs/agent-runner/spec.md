## MODIFIED Requirements

### Requirement: Job Status Vocabulary
The `JobStatus` union SHALL include the value `"orphaned"` in addition
to the existing `"running" | "completed" | "cancelled" | "crashed"` so
that jobs adopted from an on-disk worktree — without a live process —
carry a truthful label distinct from finished-run states.

#### Scenario: Orphaned status distinct from completed
- **WHEN** a job is inserted by orphan adoption
- **THEN** its `status` is `"orphaned"`, never `"completed"` (the runner has no evidence the previous run succeeded) and never `"crashed"` (no evidence the previous run failed)

## ADDED Requirements

### Requirement: Adopt Orphan Worktrees on Startup
The agent runner SHALL, on startup, invoke `git worktree list --porcelain`
against the project root and adopt every entry whose path is a direct
child of `<projectRoot>/.worktrees/` AND whose branch is
`refs/heads/agent/<change-id>`. Each adopted entry becomes a synthetic
`Job` with status `"orphaned"`, so the Kanban card can offer Merge and
Discard without the user having to drop to a terminal.

#### Scenario: Adopt a matching worktree
- **WHEN** startup sees `.worktrees/add-vscode-extension/` on branch `refs/heads/agent/add-vscode-extension`
- **THEN** a `Job` entry is inserted with `changeId = "add-vscode-extension"`, `agentName = "orphan"` (a reserved name that does not exist in `agents.yaml`), `branch = "agent/add-vscode-extension"`, `worktreePath = "<abs>/.worktrees/add-vscode-extension"`, `status = "orphaned"`, `startedAt = <mtime of the worktree dir>`, and `output = []`

#### Scenario: Skip non-matching worktrees
- **WHEN** startup sees a worktree at a path NOT under `.worktrees/` (e.g. `../other/wt`), or with a branch that does NOT match the `agent/*` prefix
- **THEN** the runner does not adopt it

#### Scenario: Skip already-adopted changes
- **WHEN** startup has already registered a running job for change `<id>` via `add-agent-process-detach`'s detached-adopt path
- **THEN** the orphan adoption skips `<id>` — the detached record wins

#### Scenario: Emit agent-job-started per adoption
- **WHEN** each orphan is adopted
- **THEN** the runner emits `agent-job-started` with the synthetic `JobSummary`, so any connected client sees the job appear

### Requirement: Orphaned Jobs Support Merge and Discard, Not Cancel or Input
The runner SHALL treat `orphaned` jobs as post-run for the purpose of
Merge and Discard flows — worktree and branch are known, so the
existing PTY-inject actions apply. Cancel and interactive input SHALL
be refused with a clear reason, since there is no process handle.

#### Scenario: Merge available
- **WHEN** the client's Kanban card renders an orphaned job
- **THEN** a Merge button is shown; clicking it opens the existing merge modal with `git merge --no-ff agent/<id>` as the preview

#### Scenario: Discard available
- **WHEN** the client's Kanban card renders an orphaned job
- **THEN** a Discard button is shown; clicking it opens the existing discard modal with `git worktree remove --force <path> && git branch -D agent/<id>`

#### Scenario: Cancel unavailable
- **WHEN** the client posts to the cancel endpoint for an orphaned job
- **THEN** the server responds `{ ok: false, reason: "Orphaned worktree has no process to cancel — Discard or Merge instead." }` and the UI hides the Cancel button

#### Scenario: Interactive input refused
- **WHEN** the client posts to `POST /api/agents/jobs/:id/input` for an orphaned job
- **THEN** the server returns 409 with a reason mentioning that orphaned jobs have no process

### Requirement: Orphaned Jobs Get Live Progress
The runner SHALL attach a `worktreeTasksWatcher` (from
`add-worktree-tasks-watcher`) to every orphaned job on adoption, so
the Kanban card's progress bar reflects the worktree's current
`tasks.md` state — including any subsequent manual edits.

#### Scenario: Watcher attached on adoption
- **WHEN** the runner adopts an orphan and starts the tasks watcher
- **THEN** the first parse produces a `worktree-progress-updated` event with the current `{done, total}` from the worktree's tasks.md

#### Scenario: Manual edit surfaces
- **WHEN** the user (or any external tool) ticks a task in the orphan's tasks.md
- **THEN** the watcher emits the updated progress and the card reflects it

### Requirement: Card Renders "Orphaned" Badge
The Kanban `ChangeCard` SHALL render an `Orphaned` badge next to the
change id when the associated job's status is `"orphaned"`, so the
user can tell that this card was adopted from disk and did not run in
the current server lifetime.

#### Scenario: Orphaned badge for adopted job
- **WHEN** the card renders a change with an orphaned job
- **THEN** an `Orphaned` label appears alongside the agent-status badges; the Merge and Discard buttons appear beneath as they would for a completed job

#### Scenario: No orphaned badge for fresh runs
- **WHEN** the card renders a change whose job status is `running` / `completed` / `crashed` / `cancelled`
- **THEN** the orphaned badge is absent
