## 1. Server PTY lifecycle

- [x] 1.1 Refactor the live-terminal registry to key sessions by project/session identity and allow an unattached WebSocket.
- [x] 1.2 Change WebSocket close handling to detach the socket without killing the PTY.
- [x] 1.3 Attach a reconnecting socket to the existing PTY and replace any prior socket safely.
- [x] 1.4 Preserve output forwarding, input, resize, and `injectIntoActive`/`injectIntoManager` behavior after reattachment.

## 2. Cleanup and safety

- [x] 2.1 Keep explicit terminal restart, project switch, server shutdown, and PTY exit cleanup behavior.
- [x] 2.2 Add disconnected-session idle TTL cleanup with a configurable default and no duplicate timers.
- [x] 2.3 Ensure concurrent reconnects cannot create duplicate PTY processes.
- [x] 2.4 Ensure project/session identity cannot attach a terminal from another project.

## 3. Client connection protocol

- [x] 3.1 Send a stable project/session identity when opening the `/pty` WebSocket.
- [x] 3.2 Reconnect automatically after transient socket loss without resetting terminal state unnecessarily.
- [x] 3.3 Keep explicit Reload Terminal behavior as a deliberate PTY restart.

## 4. Tests and documentation

- [x] 4.1 Add server tests proving socket close leaves the PTY alive and reconnect reuses it.
- [x] 4.2 Add tests for explicit restart, project switch, idle TTL, and concurrent reconnects.
- [x] 4.3 Add client tests for reconnect identity and no duplicate connection behavior.
- [x] 4.4 Document that this change covers transient WebSocket/UI disconnects, not persistence across a server process restart.
- [x] 4.5 Run `npm run typecheck`, `npm test`, and `npm run build`.
