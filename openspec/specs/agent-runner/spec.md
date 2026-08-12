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

### Requirement: initialInput Field Applies Per Agent Mode

The registry SHALL deliver the `initialInput` field from
`agents.yaml` (or the equivalent per-role `prompts` map entry
post-reshape) to the agent's process by a mechanism chosen based
on the agent's `mode` field. The registry SHALL emit an
`initialInputMode` alongside the resolved `initialInput` so
downstream code paths (PTY, runner) can select the delivery
mechanism without re-inspecting the raw config.

- **`mode: live-shell`**: `AgentRegistry.resolve()` populates
  `initialInput` with the resolved prompt string and sets
  `initialInputMode: "stdin"`. Downstream, the PTY controller
  (`attachPtyToSocket` for the embedded terminal, or the VS Code
  extension bridge) types the string into the running shell
  after the startup command settles. This preserves the
  originally-intended "prompt hits stdin" semantic.
- **`mode: single-prompt`** command-only: `AgentRegistry.resolve()`
  leaves `initialInput` undefined and sets
  `initialInputMode: "cli-arg"`. The agent's prompt is expected
  to live inside its own `args[]` array (user-authored). The
  agent runner does NOT translate `initialInput` for these agents
  because the field is absent.

The delivery mechanism SHALL NOT be reconfigured at runtime — it is
determined at load / resolve time and stays consistent for the
job's lifetime.

#### Scenario: live-shell agent resolves to stdin delivery

- **GIVEN** an `agents.yaml` entry `{ name: "claude-mgr", mode: "live-shell", command: "claude", prompts.manager: "/opsx:manage" }`
- **WHEN** the registry resolves the agent for change `add-foo`
- **THEN** `resolved.initialInput` is `"/opsx:manage"` (or the substituted variant if templates were used)
- **AND** `resolved.initialInputMode` is `"stdin"`

#### Scenario: single-prompt command-only agent has no initialInput

- **GIVEN** an `agents.yaml` entry `{ name: "codex", mode: "single-prompt", command: "codex", args: ["/opsx:apply ${change_id}"] }`
- **WHEN** the registry resolves the agent for change `add-foo`
- **THEN** `resolved.initialInput` is `undefined`
- **AND** `resolved.initialInputMode` is `"cli-arg"`
- **AND** the prompt lives in `resolved.args[0]` after template substitution

#### Scenario: Template variables substitute inside initialInput

- **GIVEN** an `agents.yaml` entry with `prompts.manager: "/opsx:manage ${change_id}"`
- **WHEN** the registry resolves the agent for change `add-foo`
- **THEN** `resolved.initialInput` is `"/opsx:manage add-foo"`
- **AND** the substitution uses the same engine that `args` and `env` share

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

### Requirement: Job Status Vocabulary

The `JobStatus` union SHALL be one of `"running" | "completed" |
"cancelled" | "crashed" | "orphaned"`. The `"orphaned"` value
carries a truthful label distinct from finished-run states for
jobs adopted from an on-disk worktree without a live process
handle.

#### Scenario: Orphaned status distinct from completed

- **WHEN** a job is inserted by orphan adoption
- **THEN** its `status` is `"orphaned"`, never `"completed"` (the runner has no evidence the previous run succeeded) and never `"crashed"` (no evidence the previous run failed)

#### Scenario: Fresh run yields running then a terminal status

- **WHEN** the runner spawns a fresh child that runs to exit
- **THEN** the job transitions `"running"` → one of `"completed"`, `"cancelled"`, or `"crashed"` per the exit signal / code; `"orphaned"` is never assigned to a fresh run

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

### Requirement: Fresh Review Artifact Contract

For every review or verify stage, the system SHALL use one absolute
`review.md` path under the server-resolved execution root. Worktree execution
SHALL target the resolved worktree and main-tree execution SHALL target the
project root. Worker instructions SHALL NOT direct the worker to a conflicting
tree.

Before starting a review or verify subprocess, AgentRunner SHALL remove a prior
artifact at that path. A completed stage SHALL be judged only from an artifact
created by the current launch.

#### Scenario: Review starts inside an existing worktree
- **GIVEN** AgentRunner resolved `.worktrees/add-x` as the execution root
- **WHEN** it launches the review worker with that directory as `cwd`
- **THEN** the review workflow does not enter `.worktrees/add-x` again
- **AND** it writes to `<worktree>/openspec/changes/add-x/review.md`

#### Scenario: Verify starts inside an existing worktree
- **GIVEN** AgentRunner resolved `.worktrees/add-x` as the execution root
- **WHEN** it launches the verify worker with that directory as `cwd`
- **THEN** the verify workflow does not enter `.worktrees/add-x` again
- **AND** both pass and needs-rework verdicts are written to the exact absolute
  artifact path supplied by the dispatcher

#### Scenario: Stale review exists before launch
- **GIVEN** a prior `review.md` exists in the resolved execution root
- **WHEN** AgentRunner starts a new review or verify worker
- **THEN** it removes the prior artifact before spawning the process
- **AND** the prior artifact cannot satisfy the new stage

#### Scenario: Main-tree review
- **GIVEN** the dispatcher selected main-tree execution
- **WHEN** the review worker starts
- **THEN** the artifact path is `<project-root>/openspec/changes/<id>/review.md`
- **AND** no worktree path is inferred

#### Scenario: Main-tree verify
- **GIVEN** the dispatcher selected main-tree execution
- **WHEN** the verify worker starts
- **THEN** the artifact path is `<project-root>/openspec/changes/<id>/review.md`
- **AND** no worktree path is inferred

### Requirement: Runtime-Aware Worker Launch Strategy

The ithyno dispatcher SHALL select a worker launch strategy from the canonical
Manager CLI identity, canonical worker CLI identity, worker mode, agmsg
availability, and native-delegation adapter availability. The strategy priority
MUST be `agmsg`, then same-CLI native delegation, then registry-backed
subprocess. CLI aliases that denote the same client, including `agy` and
`antigravity`, MUST compare as one canonical identity.

#### Scenario: Same CLI uses native delegation
- **GIVEN** the Manager and selected worker resolve to the same canonical CLI
- **AND** the Manager rendering provides a native child Agent/Tool adapter
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it invokes the native child Agent/Tool with the resolved role prompt
- **AND** it does not spawn the worker CLI subprocess

#### Scenario: Agy aliases use invoke_subagent
- **GIVEN** the Manager and worker resolve to canonical CLI `agy`
- **AND** the Agy 1.1.11 Manager runtime exposes `invoke_subagent`
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it invokes the worker through `invoke_subagent`
- **AND** it does not call AgentRunner for that same-CLI launch

#### Scenario: Cross-CLI worker uses subprocess
- **GIVEN** the Manager and selected worker resolve to different canonical CLIs
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it delegates the launch to the server Agent runner
- **AND** the server resolves and spawns the selected worker CLI

#### Scenario: Same CLI without native adapter falls back
- **GIVEN** the Manager and worker resolve to the same canonical CLI
- **BUT** the Manager rendering has no available native child adapter
- **WHEN** the dispatcher starts a stage
- **THEN** it uses the registry-backed subprocess path
- **AND** it does not invent or assume an unsupported native tool

#### Scenario: Agmsg retains priority
- **GIVEN** a worker eligible for the configured live-shell/agmsg branch
- **WHEN** the Manager and worker also have the same canonical CLI
- **THEN** the dispatcher uses agmsg according to the existing message-based completion contract
- **AND** it does not select native delegation or a direct subprocess

### Requirement: Native Delegation Preserves Worker Contracts

A same-CLI native child Agent/Tool invocation SHALL receive the same resolved
role prompt, absolute target root, review/verify artifact contract, and prior
review findings that an equivalent subprocess worker would receive. Native
delegation MUST await the child result before stage judgment and MUST NOT change
the existing code, review, verify, phase, retry, or commit ownership contracts.

#### Scenario: Native reviewer writes to the dispatcher target
- **GIVEN** a same-CLI review worker launched through a native Agent/Tool
- **WHEN** the child completes its review
- **THEN** its prompt names the exact absolute `review.md` target
- **AND** the Manager judges only the artifact at that target

#### Scenario: Native child receives rework findings
- **GIVEN** review returned `needs-rework` with actionable findings
- **WHEN** the dispatcher launches the next native code child
- **THEN** the child prompt includes those findings under the existing rework contract

#### Scenario: Agy native child is restricted to the target root
- **GIVEN** an Agy Manager launches a same-CLI child with `invoke_subagent`
- **WHEN** the dispatcher resolves worktree or main-tree execution
- **THEN** the child receives the exact absolute target root
- **AND** the child is instructed not to modify files outside that root

### Requirement: Registry Owns Cross-CLI Prompt Arguments

Every dispatcher-selected subprocess worker SHALL be launched through
`AgentRegistry.resolve()` and the Agent runner rather than through a shell
command assembled by the dispatch skill. For a resolved single prompt, Codex
MUST use `codex <args> exec <prompt>` with no Claude-style prompt flag, while
every other supported subprocess CLI MUST use `<command> <args> -p <prompt>`.
An already complete user-authored prompt invocation MUST NOT receive a duplicate
subcommand, flag, or prompt.

#### Scenario: Claude Manager launches Codex worker
- **GIVEN** a Claude Manager and a Codex single-prompt worker with no prompt in its args
- **WHEN** the dispatcher launches the worker with resolved prompt beginning `openspec-apply-change add-x`
- **THEN** the Agent runner argv contains `exec` followed by one prompt that invokes `openspec-apply-change add-x`
- **AND** that prompt explicitly limits the worker to implementation tasks and prohibits archive, spec sync, and commit
- **AND** the argv does not use `-p` as a prompt flag

#### Scenario: Codex Manager launches Agy worker
- **GIVEN** a Codex Manager and an Agy single-prompt worker with no prompt in its args
- **WHEN** the dispatcher launches the worker with resolved prompt `/opsx:apply add-x`
- **THEN** the Agent runner appends `-p` followed by `/opsx:apply add-x`
- **AND** `agents.yaml` does not need to declare `-p`

#### Scenario: Existing prompt invocation is preserved
- **GIVEN** a worker whose configured args already contain its complete native prompt invocation
- **WHEN** the registry resolves the worker
- **THEN** the configured invocation remains authoritative
- **AND** no second prompt is appended

### Requirement: Dispatcher Execution Root Reuse Is Server-Constrained

The Agent runner SHALL support dispatcher-initiated execution in the expected
worktree or current main tree without accepting an arbitrary filesystem path
from the request. The server MUST derive the execution root from its current
project, change id, and resolved execution mode; validate an existing worktree
before reuse; and reject a missing, stale, wrong-branch, or foreign-repository
target without overwriting or deleting it.

#### Scenario: Reuse the expected worktree
- **GIVEN** the dispatcher created `.worktrees/add-x` for branch `agent/add-x`
- **WHEN** it requests a registry-backed worker for `add-x` in worktree mode
- **THEN** the Agent runner uses that directory as `cwd`
- **AND** it does not attempt to create a second worktree

#### Scenario: Run in the current project root
- **GIVEN** the resolved execution mode is main-tree execution
- **WHEN** the dispatcher requests a registry-backed worker
- **THEN** the Agent runner uses the server's current project root
- **AND** the request contains no caller-selected path

#### Scenario: Reject an unexpected existing worktree
- **GIVEN** `.worktrees/add-x` exists but does not belong to the expected repository and branch
- **WHEN** the dispatcher requests its reuse
- **THEN** the server rejects the launch with actionable diagnostics
- **AND** it does not remove, reset, overwrite, or execute inside that directory

### Requirement: Multi-Dispatch Preserves Per-Change Stage Ordering

The multi-change dispatcher SHALL run `code`, `review`, and `verify`
sequentially for each individual change. A later stage SHALL start only after
the preceding worker reaches a successful terminal state and its commit or
artifact contract passes. Workers belonging to different changes MAY run
concurrently regardless of their current stage, subject to `maxParallel`.

When using AgentRunner, multi-dispatch SHALL NOT serialize changes by issuing
one blocking `wait: true` request at a time. It SHALL either submit jobs with
`wait: false` and track their ids in the combined completion loop, or launch
blocking requests concurrently and await them collectively. Completion state
MUST remain associated with the owning change.

#### Scenario: Different changes advance independently
- **GIVEN** `add-a` and `add-b` are running within `maxParallel`
- **AND** the code worker for `add-a` completes before the code worker for
  `add-b`
- **WHEN** the dispatcher validates `add-a`'s code-stage contract
- **THEN** it may start review for `add-a` while code for `add-b` continues
- **AND** it does not wait for every change to finish the code phase

#### Scenario: One change never overlaps its stages
- **GIVEN** the code worker for `add-a` is still running
- **WHEN** another change completes or another AgentRunner job id is returned
- **THEN** review for `add-a` does not start
- **AND** `add-a` advances only after its own code job completes successfully

#### Scenario: AgentRunner jobs fan out before waiting
- **GIVEN** multiple changes have available capacity
- **WHEN** multi-dispatch routes their workers through AgentRunner
- **THEN** every available job is submitted before waiting for one job to
  complete
- **AND** each returned job id is tracked against its owning change

### Requirement: Claude-Canonical Dispatch Skill Distribution

The repository SHALL keep the Claude-authored ithyno dispatch definition as the
behavioral source of truth and SHALL generate other Agent CLI dispatch material
through the universal-source renderer pipeline. Renderers MAY translate command
syntax and native Agent/Tool instructions, but generated copies MUST preserve
the launch priority and worker contracts defined by this capability.

#### Scenario: Codex rendering uses registry-backed subprocess fallback
- **GIVEN** the canonical dispatch source describes launch strategy selection
- **WHEN** the Codex rendering evaluates a same-CLI Codex worker
- **THEN** it falls back to the server Agent runner subprocess path
- **AND** it does not invent an unsupported native sub-agent tool

#### Scenario: Codex catalog resolves single-change dispatch exactly
- **GIVEN** ithyno dispatch is installed for Codex
- **WHEN** the user invokes `ithy-opsx-dispatch <change-id>` or asks to dispatch one change
- **THEN** `.codex/skills/ithy-opsx-dispatch/SKILL.md` provides an exact Skill-catalog match
- **AND** the Skill reads `.codex/prompts/ithy-opsx-dispatch.md` as the canonical workflow body
- **AND** it does not substitute `ithy-opsx-dispatch-multi` unless multiple change IDs are explicitly requested

#### Scenario: Agy rendering preserves native and fallback paths
- **GIVEN** the canonical dispatch source describes Agy native delegation
- **WHEN** the Agy rendering evaluates an Agy same-CLI worker
- **THEN** it uses `invoke_subagent`
- **AND** an Agy worker selected by a different Manager CLI still uses the server Agent runner

#### Scenario: Agy dispatch installs a mandatory delegation rule
- **GIVEN** ithyno dispatch skills are installed for Agy/Antigravity
- **WHEN** the renderer materializes the dispatch workflow
- **THEN** it also writes `.agent/rules/ithy-opsx-dispatch.md`
- **AND** the rule requires `invoke_subagent` for a selected same-CLI Agy worker
- **AND** it forbids the Manager from implementing the selected worker role itself
- **AND** it preserves the live-shell/agmsg priority and documented AgentRunner fallback

#### Scenario: Agy project-local output uses the singular directory
- **GIVEN** ithyno skills are installed for Agy/Antigravity
- **WHEN** workflows, dispatch rules, smoke probes, and installation status are materialized or inspected
- **THEN** their project-local paths use `.agent/`
- **AND** new output is not written under `.agents/`
- **AND** legacy `.agents/workflows/` output from older ithyno builds is migrated into `.agent/workflows/`
- **AND** the unrelated global agmsg path `~/.agents/skills/agmsg` remains unchanged

#### Scenario: Agy workflows use flat discoverable names
- **GIVEN** ithyno skills are rendered for Agy/Antigravity
- **WHEN** the renderer emits the dispatch workflow and its related commands
- **THEN** it writes flat files such as `.agent/workflows/ithy-opsx-dispatch.md`
- **AND** it does not rely on a nested `.agent/workflows/ithy-opsx/` directory
- **AND** executable command references use `/opsx-apply` and `/ithy-opsx-review` rather than Claude colon syntax
- **AND** converted Claude commands omit the Claude `name:` field so Agy does not expose labels such as `/ITHY-OPSX: Review`

#### Scenario: Generated output does not restore direct shell assembly
- **GIVEN** any supported CLI rendering of the dispatch skill
- **WHEN** its cross-CLI subprocess instructions are inspected
- **THEN** they route through the server Agent runner
- **AND** they do not contain the generic recipe `<entry.command> <entry.args...> -p <resolved-prompt>`

