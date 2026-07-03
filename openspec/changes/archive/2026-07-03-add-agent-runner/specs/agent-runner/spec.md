## ADDED Requirements

### Requirement: Agent Registry From agents.yaml
The system SHALL load agent definitions from `agents.yaml` at the project
root, exposing each agent's name, description, command, args, and optional
env via a read endpoint, and SHALL hide agent-driven UI affordances when no
agents are defined.

#### Scenario: Agents available
- **WHEN** `agents.yaml` declares one or more agents
- **THEN** `GET /api/agents/config` returns them and the kanban Run button is offered

#### Scenario: No agents.yaml
- **WHEN** `agents.yaml` is missing or empty
- **THEN** `GET /api/agents/config` returns an empty list and the Run button is hidden

#### Scenario: Malformed agents.yaml
- **WHEN** `agents.yaml` exists but cannot be parsed
- **THEN** the config endpoint returns the parse error message so the UI can banner it, without taking down the dashboard

### Requirement: Isolated Worktree Per Run
The system SHALL spawn each agent in a dedicated `git worktree` rooted at
`.worktrees/<change-id>/` on the `agent/<change-id>` branch, so concurrent
agents working on different changes never share a working tree.

#### Scenario: Clean run
- **WHEN** the user posts `/api/agents/run` with a `changeId` that has no existing worktree
- **THEN** the server creates `.worktrees/<change-id>/` from `agent/<change-id>`, spawns the agent with `cwd` set to that worktree, and returns the job descriptor

#### Scenario: Existing worktree
- **WHEN** the user posts `/api/agents/run` for a change whose `.worktrees/<change-id>/` already exists
- **THEN** the server returns 409 and points the user to merge or discard the existing worktree before running again

### Requirement: Per-Change Lock
The system SHALL allow at most one running job per change at a time, so
concurrent Run requests for the same change do not produce overlapping
worktrees or agent processes.

#### Scenario: Lock acquired
- **WHEN** a Run request arrives for a change with no active job
- **THEN** the server records `changeId → jobId` and spawns the agent

#### Scenario: Lock held
- **WHEN** a Run request arrives for a change whose previous job is still running
- **THEN** the server returns 409 with the active job id and does NOT spawn

#### Scenario: Lock released on exit
- **WHEN** an active job finishes for any reason (completed, cancelled, crashed)
- **THEN** the lock for that change is released and a subsequent Run is permitted

### Requirement: Live Output Streaming
The system SHALL stream agent stdout and stderr to all connected dashboard
clients over WebSocket, and SHALL retain a bounded per-job output buffer for
late-attaching clients.

#### Scenario: Live tail
- **WHEN** an agent writes a line to stdout or stderr
- **THEN** the server broadcasts an `agent-job-output` event with the chunk and stream identifier

#### Scenario: Late attach
- **WHEN** a client opens `/agents` after a job has been producing output
- **THEN** it first fetches the recent output buffer from `GET /api/agents/jobs/:id`, then attaches the WS for new chunks

#### Scenario: Buffer cap
- **WHEN** an agent produces more than the per-job output cap
- **THEN** the buffer retains the most recent N lines and earlier lines are dropped silently

### Requirement: Job Lifecycle and Endpoints
The system SHALL expose endpoints to run, list, inspect, and cancel jobs;
all endpoints are local-only.

#### Scenario: List jobs
- **WHEN** a local client requests `GET /api/agents/jobs`
- **THEN** the server returns recent jobs (default last 50) in start-time-desc order, including status and timing

#### Scenario: Inspect job
- **WHEN** a local client requests `GET /api/agents/jobs/:id`
- **THEN** the server returns the full job descriptor including the current output buffer

#### Scenario: Cancel job
- **WHEN** a local client posts `/api/agents/jobs/:id/cancel` on a running job
- **THEN** the server sends SIGTERM to the agent process and the job ends with status "cancelled"

#### Scenario: Non-local client refused
- **WHEN** any agents endpoint is requested from a non-localhost client
- **THEN** the server rejects with 403

### Requirement: Manual Merge and Discard via PTY Inject
The system SHALL provide UI actions to merge or discard a completed agent
run by previewing the corresponding `git` command and sending it into the
embedded terminal via the existing inject endpoint, so the user can review
the git output in their own shell.

#### Scenario: Merge a completed run
- **WHEN** the user clicks Merge on a card whose latest job has finished
- **THEN** the dashboard opens the command modal previewing `git merge agent/<change-id>` and, on confirm, sends it to the active embedded terminal

#### Scenario: Discard a completed run
- **WHEN** the user clicks Discard on a card whose latest job has finished
- **THEN** the dashboard previews the cleanup commands (`git worktree remove --force .worktrees/<change-id>` and `git branch -D agent/<change-id>`) and, on confirm, injects them
