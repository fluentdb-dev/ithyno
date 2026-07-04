## MODIFIED Requirements

### Requirement: Agent Spawn Model
The agent runner SHALL spawn agents via `child_process.spawn(cmd, args,
{ stdio: ["ignore", "pipe", "pipe"] })` — piped stdio, NO pseudo-terminal.
The PTY-based spawn path added by `add-agent-pty-runner` is removed
because Claude Code's `-p "<initial input>"` flag (and equivalents for
other CLIs) makes the interactive-REPL requirement moot.

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

## REMOVED Requirements

### Requirement: Agent Stdin Input Endpoint
The endpoint `POST /api/agents/jobs/:id/input` (added by
`add-agent-stdin-relay`) and the `AgentRunner.writeInput()` method
are REMOVED. With `-p` mode, agents never prompt, so no relay is
required.

### Requirement: Xterm.js Agent Output Renderer
The `<AgentOutputView />` xterm.js instance for job output (added by
`add-agent-xterm-output`) is REMOVED. Agent output is rendered as a
scrolling `<pre>` element with SGR color codes translated to
`<span>` styling via a small `ansi-to-html` helper. Cursor motion is
neither expected nor supported in agent output (piped stdio + `-p`
mode does not emit any).
