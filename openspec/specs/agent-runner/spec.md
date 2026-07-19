# agent-runner Specification

## Purpose
TBD - created by archiving change add-agent-runner. Update Purpose after archive.
## Requirements
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

### Requirement: Agent Spawn Model
The agent runner SHALL spawn agents via `child_process.spawn(cmd, args,
{ stdio: ["ignore", "pipe", "pipe"] })` — piped stdio, NO pseudo-terminal.
Claude Code's `-p "<initial input>"` flag (and equivalents for
other CLIs) makes the interactive-REPL requirement moot; the runner
never grants a controlling TTY.

The PTY / xterm / stdin-relay layers that were prototyped in
`add-agent-pty-runner`, `add-agent-xterm-output`, and
`add-agent-stdin-relay` are reverted by THIS change. Those upstream
proposals were never archived (their ADDED requirements never
reached the `agent-runner` capability spec), so this delta records
the post-revert baseline directly as ADDED requirements rather than
modifying nonexistent ones.

#### Scenario: Piped stdio spawn
- **WHEN** the runner spawns an agent
- **THEN** `stdio` is `["ignore", "pipe", "pipe"]`
- **AND** the child does NOT receive a controlling TTY
- **AND** `child.stdout.on("data")` / `child.stderr.on("data")` are the sources of the job's output ring buffer

#### Scenario: node-pty is not required at agent-spawn time
- **WHEN** the process running the server has no working `node-pty` module (VSIX distribution, or missing native binding)
- **THEN** the agent runner still spawns agents successfully — no PTY dependency at this path
- **AND** the embedded terminal (a separate consumer of `node-pty` for user-facing xterm.js) is unaffected

### Requirement: Initial Input Translation
The runner SHALL translate an agent definition's `initialInput` string
into a `-p "<initialInput>"` CLI argument at spawn time. If the agent's
own args already contain `-p`, the runner SHALL leave those args
unchanged (user's explicit configuration wins).

#### Scenario: Default translation
- **GIVEN** an agent def `{ name: "claude", command: "claude", initialInput: "/opsx:apply add-x" }`
- **WHEN** the runner spawns the agent
- **THEN** the spawned command line is `claude -p "/opsx:apply add-x"`

#### Scenario: User-supplied -p wins
- **GIVEN** an agent def whose args already include `-p`
- **WHEN** the runner spawns the agent
- **THEN** the runner does NOT prepend an additional `-p`
- **AND** the user's args are used verbatim

### Requirement: Spawn Command Line Echo
When the runner starts an agent process, it SHALL push one synthetic
`stdout` line at the top of the job's transcript containing a
shell-quoted representation of the spawned command line. `-p` mode
buffers agent output and flushes at end; without this synthetic line
the user sees a blank transcript for the entire run.

#### Scenario: Transcript begins with the command line
- **WHEN** a job spawns
- **THEN** the first `agent-job-output` broadcast is `stream: "stdout"` with `chunk` of the form `$ <command> <shell-quoted args>\n\n`
- **AND** subsequent broadcasts are the child's actual stdout / stderr

### Requirement: Agent Output Rendering
Agent job output SHALL be rendered as a scrolling `<pre>` element on
the Agents page. SGR color codes SHALL be converted to inline
`<span style="color:…">` markup. Cursor motion codes SHALL be
stripped defensively (piped stdio + `-p` mode does not emit any,
but the renderer must survive any that leak through).

#### Scenario: Colored output
- **GIVEN** the agent emits `\x1b[32mgreen\x1b[0m` to stdout
- **WHEN** the Agents page renders the transcript
- **THEN** the word "green" appears wrapped in a span with the palette's green foreground
- **AND** no literal `\x1b[…` sequence is visible in the DOM

#### Scenario: No PTY / xterm dependency at render time
- **WHEN** the Agents page mounts
- **THEN** it does NOT instantiate `xterm.js`
- **AND** does NOT open a WebSocket for agent output byte streams (existing WS event `agent-job-output` in the shared broadcast channel is enough)

### Requirement: Cancel UI Feedback
When the user clicks Cancel on a running job, the button SHALL
switch to `Cancelling…` and be disabled until the job's status
transitions off `running`. The transition unmounts the button
naturally via its existing `job.status === "running"` guard.

#### Scenario: Button transitions to Cancelling…
- **WHEN** the user clicks Cancel on a running job
- **THEN** the button label reads `Cancelling…`
- **AND** the button is `disabled`
- **WHEN** the `agent-job-finished` WS event fires for the job
- **THEN** the button is removed from the DOM (guard evaluates false)

### Requirement: No Live Stdin From UI
The dashboard SHALL NOT expose an endpoint or UI for writing to a
running agent's stdin. `-p` mode agents do not prompt; interactive
prompts have no target and would leak through to a process that
cannot answer them.

#### Scenario: No input endpoint exists
- **WHEN** any client sends `POST /api/agents/jobs/:id/input`
- **THEN** the server returns 404 (route is not registered)

