## ADDED Requirements

### Requirement: Agent Output Renders Through a Terminal Emulator
The Agents page SHALL render each job's output through an xterm.js
terminal instance so ANSI escape sequences, cursor motion, colors, and
in-place redraws (spinners, status lines) render as they would in a
real terminal — matching the fidelity of the dashboard's existing
embedded terminal panel.

#### Scenario: Output view mounts an xterm terminal
- **WHEN** the user expands a job row and selects the Output tab
- **THEN** an xterm.js Terminal is created and attached to a container inside the row; scrollback matches the server's `RING_LIMIT` (10000 lines)

#### Scenario: Historical output is seeded on mount
- **WHEN** the terminal mounts
- **THEN** the job's `output` array (fetched via `GET /api/agents/jobs/:id`) is written to the terminal in order — `stdout`, `stderr`, and `stdin` chunks all pass through `term.write` verbatim

#### Scenario: Live chunks append without re-seeding
- **WHEN** new `agent-job-output` events arrive via WebSocket for the currently-mounted job
- **THEN** only the newly-appended entries in `jobOutputs[jobId]` are written to the terminal (tracked by a `lastWrittenLen` counter), never a full replay

#### Scenario: Terminal fits its container
- **WHEN** the container is measurable (job row expanded, layout stabilized)
- **THEN** `@xterm/addon-fit` computes cols/rows once at mount and again on container `ResizeObserver` events; the terminal never overflows the container horizontally

#### Scenario: Terminal cleanup on unmount
- **WHEN** the job row collapses, the tab switches, or the page unmounts
- **THEN** the xterm Terminal instance is disposed, WS subscription is dropped, and the `ResizeObserver` is disconnected

### Requirement: Interactive Terminal Forwards Keystrokes to the PTY
The terminal SHALL be interactive: user keystrokes captured by
xterm.js SHALL be forwarded to the running agent's PTY via the
existing `POST /api/agents/jobs/:id/input` endpoint with
`appendNewline: false`, so users can drive Claude Code's arrow-key
option selectors, Aider's confirm prompts, Ctrl-C, Tab-completion,
and any other terminal-native interaction from the Agents page.

#### Scenario: Keystrokes are forwarded
- **WHEN** the terminal has focus and the user presses a key
- **THEN** xterm's `onData` event fires with the terminal-standard byte(s) for that key (`\r` for Enter, `\x1b[A` for Up-arrow, `\x03` for Ctrl-C, printable characters as-is), and the client calls `sendAgentInput(jobId, data, false)`

#### Scenario: Paste is one round-trip
- **WHEN** the user pastes text into the terminal
- **THEN** xterm delivers the paste as a single `onData` chunk; the client forwards it as one `sendAgentInput` call, not per-character

#### Scenario: Terminal echo comes from the agent, not local echo
- **WHEN** the user types characters
- **THEN** xterm does not add local echo; the visible characters appear only when the PTY (via the agent's line discipline) echoes them back through the normal output stream, matching how a real terminal-connected process behaves

#### Scenario: Endpoint is unchanged
- **WHEN** input arrives via the terminal path
- **THEN** the server uses the same `POST /api/agents/jobs/:id/input` endpoint defined by `add-agent-stdin-relay` — same auth, same 404/409/500 responses; the only difference is that `appendNewline: false` is always set for terminal-originated input, since xterm sends the correct terminal bytes directly

### Requirement: Remove the Separate Text Input Field
With the terminal itself accepting keystrokes, the Agents page SHALL
NOT retain the `<textarea>`-based `Send input to agent` field
introduced by `add-agent-stdin-relay`; the terminal is the single
input surface, and dual affordances would confuse (the textarea
cannot send arrow keys, Tab, or control characters).

#### Scenario: The old input field is removed
- **WHEN** the code review after this change is done
- **THEN** `JobInputField` no longer exists in `web/src/pages/Agents.tsx` and no equivalent replacement is added; users interact via the terminal itself

### Requirement: No Fallback Plain-Text Renderer
The Agents page SHALL NOT retain a plain `<pre>`-based output renderer
alongside the xterm view; the xterm view is the single render path so
maintenance surface stays small.

#### Scenario: The old JobOutput component is removed
- **WHEN** the code review after this change is done
- **THEN** the `<pre>`-based `JobOutput` no longer exists in `web/src/pages/Agents.tsx`
