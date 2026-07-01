## Why

We adopted OpenSpec for our workflow and embedded a terminal so Claude Code runs
alongside the kanban. Today, kicking off the workflow (propose a new change,
apply, archive) still requires typing the `/opsx:*` slash command into the
terminal by hand. The UI can close that last gap by initiating the command
itself, while the LLM stays exactly where it belongs — in Claude Code in the
terminal.

## What Changes

Add dashboard controls that initiate the OpenSpec workflow by injecting the
corresponding `/opsx:*` command into the active embedded terminal:

- An "+ New Change" action on the Overview page that injects `/opsx:propose`.
- A per-change "Apply" action that injects `/opsx:apply <id>`.
- A per-change "Archive" action that injects `/opsx:archive <id>`.

The server gains a localhost-only `POST /api/pty/inject` endpoint that writes
text to the most recently active `/pty` socket. The UI never owns the LLM — it
only types on the user's behalf into the terminal where Claude Code already runs.

## Capabilities

### New Capabilities
- `ui-orchestration`: dashboard controls that initiate the OpenSpec workflow by
  injecting opsx commands into the embedded terminal

### Modified Capabilities
- `embedded-terminal`: the PTY bridge gains a server-side inject API for
  programmatic input, kept local-only and tied to the active session

## Impact

- New `POST /api/pty/inject` endpoint
- Server-side registry of active `/pty` sockets (track the most recently active)
- New UI controls on Overview and ChangeDetail (button + modal + confirm)
- No new dependencies; reuses the existing `/pty` WebSocket
