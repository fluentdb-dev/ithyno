## MODIFIED Requirements

### Requirement: Agent Process I/O
The agent runner SHALL spawn each child process **inside a pseudo-terminal
(PTY)** so TTY-detecting CLIs enter their interactive modes, and SHALL
relay user input and initial prompts through the PTY's write channel.

#### Scenario: Child sees a real TTY
- **WHEN** the runner spawns an agent
- **THEN** the child is spawned via `node-pty.spawn` (through the existing `server/sync/pty.ts` `loadPty` helper) with `TERM=xterm-256color` and a fixed size of 200 columns x 50 rows, so `isatty(0)` / `isatty(1)` return true inside the child

#### Scenario: PTY unavailable
- **WHEN** the native pty module fails to load (locked-down system, install failure)
- **THEN** the runner's `run()` returns `{ ok: false, status: 500, reason: <pty error> }` and no worktree is spawned; the dashboard surfaces the error via the existing runAgent error path

#### Scenario: Existing agents behave interactively
- **WHEN** a REPL-style CLI (Claude Code, Aider, Codex) is spawned under the pty runner
- **THEN** it does not print a "no TTY" warning, does not idle silently after receiving its initial prompt, and produces streaming output as it would in a normal terminal

### Requirement: Job Input Endpoint
The system SHALL relay writes from `POST /api/agents/jobs/:id/input` to
the child's PTY write channel (formerly `child.stdin.write`), preserving
the semantics of `add-agent-stdin-relay` — same auth gates, same 404 /
409 / 500 responses, same `[stdin]` echo into the ring buffer and WS
broadcast.

#### Scenario: Enter maps to carriage return
- **WHEN** the client posts `{ data: "y" }` with the default `appendNewline: true`
- **THEN** the server writes `"y\r"` to the pty (a terminal-level "Enter" byte), not `"y\n"`, so line-discipline cooked mode delivers `y\n` to the child as if the user typed and pressed Enter

#### Scenario: Explicit no-newline write
- **WHEN** the client posts `{ data: "y", appendNewline: false }`
- **THEN** the server writes exactly `"y"` to the pty (no `\r` appended)

### Requirement: Optional Initial Input on Agent Spawn
The runner SHALL write the resolved `initialInput` (from
`add-agent-initial-input`) to the **PTY write channel** immediately
after spawn, appending `\r` (not `\n`) when the value does not already
end with `\r` or `\n`.

#### Scenario: Initial input arrives at the REPL
- **WHEN** an agent with `initialInput: "/opsx:apply ${change_id}"` is spawned
- **THEN** the runner writes `"/opsx:apply <resolved-id>\r"` to the pty, the child's REPL sees it as if the user typed the line and pressed Enter, and the transcript's first line is `[stdin] /opsx:apply <resolved-id>\r`

#### Scenario: Initial input preserves any trailing newline the user supplied
- **WHEN** the `initialInput` already ends with `\r` or `\n`
- **THEN** no extra byte is appended (the value is written as-is)

## ADDED Requirements

### Requirement: Merged Output Stream
The agent runner SHALL emit all pty output into the job's ring buffer as
`stream: "stdout"` entries, since the pty merges stdout and stderr into
a single stream by design; the ring-buffer schema RETAINS the
`"stderr"` value in its stream union so future non-pty producers can
still tag stderr, and the `"stdin"` value continues to mark bytes
originating from `writeInput` and `initialInput`.

#### Scenario: Output rendered as one stream
- **WHEN** the child prints to what it thinks is stdout, stderr, or a
  tty-drawn progress line
- **THEN** the runner receives it via `pty.onData(...)` and pushes it
  as `{ stream: "stdout", chunk, ts }` — no `"stderr"` classification
  is attempted per byte from the pty

#### Scenario: ANSI escape sequences are preserved raw
- **WHEN** the child emits color codes or cursor-motion escape sequences
- **THEN** the runner stores the bytes verbatim in the ring buffer; interpretation happens at render time, not at capture time
