## ADDED Requirements

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
