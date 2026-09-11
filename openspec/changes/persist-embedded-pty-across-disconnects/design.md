## Context

The server currently creates one `node-pty` per `/pty` WebSocket and kills it
from the socket `close` handler. Browser/WebView reconnects are therefore
destructive even when the server and shell are healthy. The existing terminal
size and explicit restart flows must remain intact.

## Goals / Non-Goals

**Goals:**

- Keep one server-owned PTY per project while clients temporarily disconnect.
- Reattach a new WebSocket to that PTY without spawning a duplicate shell.
- Preserve output, input, resize, and programmatic injection semantics.
- Keep explicit restart, project switch, and server shutdown as destructive cleanup paths.

**Non-Goals:**

- Persisting a PTY across a server process restart.
- Using tmux, screen, or another external terminal multiplexer.
- Recovering PTYs that were already killed or belong to another project.

## Decisions

1. **Separate PTY lifetime from socket lifetime.** Store live terminals by a
   stable project/session key and make the attached WebSocket optional. A socket
   close only detaches the client; it does not call `term.kill()`.
2. **Use an explicit reconnect identity.** The client sends a project/session
   identifier when opening `/pty`; the server reuses the matching live entry.
   If no matching entry exists, it creates one as today. A second socket for the
   same key replaces the old attachment instead of spawning another PTY.
3. **Keep cleanup explicit.** `terminateAllLivePtys()` and the user restart
   endpoint still kill the PTY and clear its registry entry. A PTY exit also
   removes its entry.
4. **Bound disconnected resources.** Add an idle TTL for PTYs with no attached
   socket, after which the server kills and removes them. The TTL is a safety
   valve, not the normal reconnect path, and is covered by fake-timer tests.

## Risks / Trade-offs

- [Disconnected PTY remains alive indefinitely] → idle TTL and explicit restart cleanup.
- [A stale client receives output after replacement] → close the previous socket before attaching the new one.
- [Duplicate project sessions] → stable key and single-entry registry enforcement.
- [Server restart still loses node-pty] → document this boundary; a separate external process persistence change would be required.

## Migration Plan

No configuration migration is required. Existing clients without a session key
continue to use the current single-terminal behavior. Rollback restores the
socket-close kill behavior.

## Open Questions

- Select and document the default idle TTL (initial proposal: 10 minutes).
- Confirm whether missed output should be replayed from a bounded in-memory
  buffer when a client reattaches.
