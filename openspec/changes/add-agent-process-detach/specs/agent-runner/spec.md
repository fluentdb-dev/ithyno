## ADDED Requirements

### Requirement: Detached Agent Mode
The agent runner SHALL support a `detached: true` flag per agent in
`agents.yaml`. When set, the agent MUST be spawned via `child_process.spawn`
(not `node-pty`) with `detached: true`, its stdout and stderr redirected
to a per-job log file inside the worktree, and its handle unref'd from
the Node event loop, so the process outlives the server that spawned it.

#### Scenario: Detached spawn uses file-based stdio
- **WHEN** the runner spawns an agent with `detached: true`
- **THEN** the child is spawned via `child_process.spawn` with `stdio: ["ignore", <logFd>, <logFd>]`, `detached: true`, and `cwd = <worktreePath>`; then `child.unref()` is called

#### Scenario: PTY agents unaffected
- **WHEN** the runner spawns an agent without `detached: true` (or with `detached: false`)
- **THEN** the existing `node-pty`-based spawn path is used unchanged; PTY, interactive stdin, and cursor-motion output preserved

### Requirement: Detached Agent Meta File
The runner SHALL write a JSON meta file at
`<worktree>/.agent-meta.json` immediately after a detached spawn,
before emitting `agent-job-started`, and MUST delete it when the
detached job transitions to any terminal state — so a subsequent server
startup has a reliable, self-cleaning breadcrumb list to adopt from.

#### Scenario: Meta file shape
- **WHEN** a detached job starts
- **THEN** `<worktree>/.agent-meta.json` exists with `{ jobId, changeId, agentName, pid, startedAt, logPath }` (all strings/numbers, no functions or refs)

#### Scenario: Meta file removed on terminal transition
- **WHEN** the detached job transitions to `completed`, `crashed`, or `cancelled`
- **THEN** the runner deletes the meta file as part of `finish()`; adoption on the next startup does not attempt to re-adopt this pid

### Requirement: Detached Adoption at Startup
On server startup, the runner SHALL scan
`<projectRoot>/.worktrees/*/.agent-meta.json`, validate each entry, and
adopt live processes back into its in-memory job map as `status:
"running"` — so agents that the server left behind on a previous exit
are visible in the UI again.

#### Scenario: Adopt an alive process
- **WHEN** startup finds a meta file whose `pid` responds to `process.kill(pid, 0)` without error AND whose worktree still exists
- **THEN** the runner creates a `Job` entry `{ id: meta.jobId, changeId, agentName, status: "running", startedAt: meta.startedAt, output: [] }`, starts a log-tail on `meta.logPath`, starts a worktree-tasks watcher, and marks the job as `detached: true` (surface via `JobSummary`)

#### Scenario: Drop a stale meta file (dead pid)
- **WHEN** the meta file's pid is not alive (`process.kill(pid, 0)` throws `ESRCH`)
- **THEN** the runner deletes the meta file and does not adopt

#### Scenario: Drop a stale meta file (worktree gone)
- **WHEN** the meta file's worktree directory no longer exists
- **THEN** the runner deletes the meta file and does not adopt

#### Scenario: Cross-check for pid reuse
- **WHEN** the meta file's pid is alive but the process's cmdline does not contain the recorded `agentName` command
- **THEN** the runner deletes the meta file and does not adopt (pid was reused by an unrelated process during the server's absence)

### Requirement: Shutdown Skips Detached Jobs
The runner's `shutdown()` SHALL NOT send SIGTERM to detached agent
processes; only PTY-mode processes receive the shutdown signal, so
detached agents survive the server exit.

#### Scenario: Detached jobs survive shutdown
- **WHEN** `shutdown()` is called and a detached job is running
- **THEN** the detached child receives no SIGTERM from the runner; its meta file remains on disk for the next startup

#### Scenario: PTY jobs still terminate
- **WHEN** `shutdown()` is called and a PTY job is running
- **THEN** the PTY child receives SIGTERM as it did pre-change

### Requirement: Exit Detection for Detached Jobs
The runner SHALL detect the exit of a detached agent by polling
`process.kill(pid, 0)` at least once every 5 seconds; on `ESRCH` the
runner MUST transition the job to `completed` (with `exitCode: null` in
v1) and emit `agent-job-finished`.

#### Scenario: Detached exit detected
- **WHEN** a detached job's process pid no longer exists at poll time
- **THEN** within one poll interval the runner emits `agent-job-finished` with `status: "completed"` and `exitCode: null`, deletes the meta file, and disposes the log-tail watcher

#### Scenario: Cancel a detached job
- **WHEN** the client calls the cancel endpoint on a detached job
- **THEN** the runner sends SIGTERM to the recorded pid; the exit detector picks up the death on the next poll and finalizes as `cancelled`

### Requirement: Detached Jobs Refuse Interactive Input
The runner's `writeInput` endpoint SHALL return HTTP 409 with a reason
explaining that interactive input is disabled for detached jobs, so the
client learns the trade-off explicitly instead of silently discarding
bytes.

#### Scenario: Interactive input on a detached job
- **WHEN** the client posts input to `POST /api/agents/jobs/:id/input` for a detached job
- **THEN** the server returns 409 with a `reason` mentioning that the job is detached and cannot accept interactive input; nothing is written

### Requirement: Detached Flag Surfaced in Job Payloads
`JobSummary` SHALL include an optional `detached: true` field for
detached jobs so the UI (Agents page, Kanban card, Diff view) can
render a distinct badge and disable input affordances client-side.

#### Scenario: JobSummary includes detached flag
- **WHEN** a job is detached (fresh spawn or adopted)
- **THEN** the JobSummary shape emitted over `/api/agents/jobs` and via WS events includes `detached: true`

#### Scenario: JobSummary omits flag for PTY jobs
- **WHEN** a job is PTY-mode
- **THEN** the flag is omitted (or `false`); the client treats absence as "not detached"
