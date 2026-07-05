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

### Requirement: Agent Role Metadata Fields
The agent registry SHALL accept optional `role` (string), `specialties`
(string array), and `concurrency` (integer) fields on each agent
definition, and SHALL default absent fields to `role: "coder"`,
`specialties: []`, and `concurrency: 1` so that agent registry files
written before this change load and behave identically.

#### Scenario: Legacy registry file loads with defaults
- **GIVEN** an `agents.yaml` containing only `name`, `command`, and `args` (the shipped template shape)
- **WHEN** the registry loads the file
- **THEN** loading succeeds with `ok: true`
- **AND** the parsed agent carries `role: "coder"`, `specialties: []`, `concurrency: 1`

#### Scenario: Fully specified agent round-trips
- **GIVEN** an agent entry with `role: reviewer`, `specialties: [area/web, feature/ui]`, and `concurrency: 2`
- **WHEN** the registry loads the file
- **THEN** the parsed `AgentDef` exposes exactly those values

#### Scenario: Partially specified agent gets remaining defaults
- **GIVEN** an agent entry that sets only `role: proposer`
- **WHEN** the registry loads the file
- **THEN** the parsed agent carries `role: "proposer"`, `specialties: []`, `concurrency: 1`

### Requirement: Agent Metadata Validation
The agent registry SHALL reject definitions whose metadata fields have
the wrong shape — `role` that is not a non-empty string, `specialties`
that is not an array of non-empty strings, or `concurrency` that is not
an integer greater than or equal to 1 — and SHALL report the error
through the existing registry error channel, naming the offending agent
and field.

#### Scenario: Non-integer concurrency is rejected
- **GIVEN** an agent entry with `concurrency: 1.5`
- **WHEN** the registry loads the file
- **THEN** loading yields `ok: false` with an error naming the agent and the `concurrency` field

#### Scenario: Zero concurrency is rejected
- **GIVEN** an agent entry with `concurrency: 0`
- **WHEN** the registry loads the file
- **THEN** loading yields `ok: false` with an error naming the agent and the `concurrency` field

#### Scenario: Non-string specialty element is rejected
- **GIVEN** an agent entry with `specialties: [area/web, 42]`
- **WHEN** the registry loads the file
- **THEN** loading yields `ok: false` with an error naming the agent and the `specialties` field

#### Scenario: Arbitrary role strings are accepted
- **GIVEN** an agent entry with `role: archivist` (a role no other part of the system knows about)
- **WHEN** the registry loads the file
- **THEN** loading succeeds — roles are an open set and are not validated against an enum

### Requirement: Metadata Fields Are Inert
The agent runner SHALL NOT change job dispatch, worktree placement, or
process spawning based on `role`, `specialties`, or `concurrency`. The
fields are recorded metadata for later phases; in particular,
`concurrency` SHALL NOT be enforced as a job cap.

#### Scenario: Role-annotated agent spawns identically
- **GIVEN** an agent whose definition carries `role: reviewer` and `specialties: [area/server]`
- **WHEN** a job is started for change `<id>` with that agent
- **THEN** the runner creates `.worktrees/<id>/` on branch `agent/<id>` and spawns the agent exactly as it would for an unannotated agent

#### Scenario: Declared concurrency is not enforced
- **GIVEN** an agent whose definition carries `concurrency: 1`
- **WHEN** jobs for two different changes are started with that agent
- **THEN** both jobs run; no queueing or rejection occurs on account of the `concurrency` value

### Requirement: Worktree Pool Opt-In Configuration
The agent registry SHALL accept an optional per-agent `dedicated` boolean
(default `true`) and an optional top-level `worktreePool` block with
`max` (integer ≥ 1, default 5), `namePrefix` (default `"pool"`), and
`cleanupBetweenJobs` (only `"git-clean"` accepted in this phase). The
pool SHALL be used only for agents with `dedicated: false`; absent any
opt-in, the runner SHALL behave exactly as before this change and SHALL
create no pool directories.

#### Scenario: Legacy configuration is unchanged
- **GIVEN** an `agents.yaml` with no `dedicated` fields and no `worktreePool` block
- **WHEN** a job is started
- **THEN** the runner creates `.worktrees/<change-id>/` on branch `agent/<change-id>` as before
- **AND** no `.worktrees/pool-*` directory is ever created

#### Scenario: Pool block without opted-in agents is inert
- **GIVEN** a `worktreePool` block is present but every agent has `dedicated: true` or omits the field
- **WHEN** jobs are started
- **THEN** all jobs use dedicated per-change worktrees and no pool worktree is created

#### Scenario: Unsupported cleanup mode is rejected
- **GIVEN** a `worktreePool` block with `cleanupBetweenJobs: recreate`
- **WHEN** the registry loads the file
- **THEN** loading yields an error stating the mode is not yet supported

#### Scenario: Unknown pool keys are rejected
- **GIVEN** a `worktreePool` block containing `idleReleaseAfter: 300`
- **WHEN** the registry loads the file
- **THEN** loading yields an error naming the unrecognized key

### Requirement: Pool Worktree Acquisition
For an agent with `dedicated: false`, the runner SHALL lease a pool
worktree at job start: reusing a free `.worktrees/<prefix>-N/`, lazily
creating the next one while fewer than `max` exist, and adopting branch
`agent/<change-id>` in the leased worktree — creating the branch if it
does not exist, reusing it if it does. The checked-out branch is the
authoritative record of which change holds the lease. When all `max`
worktrees are leased, the job Start SHALL fail with an explicit
pool-exhausted error — no queueing and no fallback to a dedicated
worktree. If the branch is already checked out in another worktree,
git's refusal SHALL surface as a Start error (no partial lease).

#### Scenario: First pool job creates pool-1 lazily
- **GIVEN** a pool-enabled agent and no existing pool worktrees
- **WHEN** a job is started for change `<id>`
- **THEN** `.worktrees/pool-1/` is created with branch `agent/<id>` checked out and the agent spawns with that directory as its working directory
- **AND** `${worktree_path}` and `${branch}` template variables resolve to the pool path and `agent/<id>`

#### Scenario: Concurrent jobs get distinct pool worktrees
- **GIVEN** a running pool job leasing `pool-1` and `max` ≥ 2
- **WHEN** a second pool job starts for a different change
- **THEN** it leases `.worktrees/pool-2/` on its own `agent/<id>` branch

#### Scenario: Exhausted pool fails the start explicitly
- **GIVEN** `max: 2` with both pool worktrees leased
- **WHEN** a third pool job is started
- **THEN** the Start fails with an error identifying the pool as exhausted and stating the cap
- **AND** no `.worktrees/pool-3/` and no `.worktrees/<change-id>/` is created

#### Scenario: Reusing an existing agent branch
- **GIVEN** branch `agent/foo` already exists (from an earlier run of the same change) with commits
- **WHEN** a pool job for change `foo` is started
- **THEN** the pool worktree checks out `agent/foo` at its existing tip (no new commits, prior commits preserved)
- **AND** subsequent agent work builds on that history

#### Scenario: Same change cannot straddle two worktrees
- **GIVEN** a dedicated `.worktrees/foo/` worktree with `agent/foo` checked out (from a legacy `dedicated: true` job)
- **WHEN** a pool job is started for change `foo`
- **THEN** git refuses the checkout because the branch is in use elsewhere
- **AND** the Start fails with that git error surfaced verbatim
- **AND** no partial pool lease is recorded

### Requirement: Pool Worktree Release And Cleanup
When a pool job ends in any terminal state, the runner SHALL release the
worktree using `git-clean` semantics: reset tracked modifications
(`git reset --hard`), remove untracked files (`git clean -fd`), keep
ignored files (dependency and build caches — the pool's reuse benefit),
and detach HEAD at the repo's resolved default branch (via
`git symbolic-ref refs/remotes/origin/HEAD` with fallback to `main`
then `master`, cached for the pool's lifetime). The `agent/<change-id>`
branch SHALL be preserved for the normal merge flow. Uncommitted work
in the pool worktree is discarded at release.

#### Scenario: Completed job returns a clean worktree to the pool
- **GIVEN** a pool job on `pool-1` that committed its work to `agent/<id>` and left stray untracked files
- **WHEN** the job completes
- **THEN** `pool-1` has no tracked modifications and no untracked files, sits on a detached HEAD at the default branch, and is available for the next acquire
- **AND** branch `agent/<id>` still exists with the committed work

#### Scenario: Ignored files survive cleanup
- **GIVEN** a pool worktree containing an ignored `node_modules/` directory
- **WHEN** the leasing job ends and cleanup runs
- **THEN** `node_modules/` remains, and the next job leasing this worktree starts with the cache intact

#### Scenario: Failed cleanup quarantines the worktree
- **GIVEN** the cleanup sequence fails partway on `pool-1`
- **WHEN** release completes
- **THEN** `pool-1` is excluded from future acquires and the failure is logged, rather than being handed to the next job dirty

#### Scenario: Non-standard default branch
- **GIVEN** a repository whose default branch (per `git symbolic-ref refs/remotes/origin/HEAD`) is `develop`
- **WHEN** a pool job releases its worktree
- **THEN** the release detaches HEAD at `develop`, not `main` or `master`

### Requirement: Pool Worktree Restart Recovery
On startup, the runner SHALL extend the existing orphan-adoption scan
(which uses `.worktrees/<change-id>` PATH matching) with a
pool-worktree branch-name inference pass. A pool worktree with a branch
matching `agent/<change-id>` checked out SHALL be adopted as an orphan
job with its lease reconstructed from the branch name; a pool worktree
on a detached HEAD SHALL be registered as free and eligible for
acquisition.

#### Scenario: Restart during a pool job adopts it
- **GIVEN** a pool job running on `pool-1` (branch `agent/<id>` checked out)
- **WHEN** the server restarts
- **THEN** the job is adopted as an orphan for change `<id>` and `pool-1` is recorded as leased, exactly as a dedicated-worktree orphan would be

#### Scenario: Restart with idle pool worktrees keeps them available
- **GIVEN** `pool-1` and `pool-2` exist on detached HEADs with no jobs
- **WHEN** the server restarts and a new pool job is started
- **THEN** the job leases one of the existing worktrees rather than creating `pool-3`

