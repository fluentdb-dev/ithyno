## Why

The embedded Manager terminal currently treats a WebSocket disconnect as a
terminal event and kills its PTY. A transient Dashboard reload, focus change,
or network interruption therefore destroys the running shell and CLI session.

## What Changes

- Keep the server-owned embedded PTY alive when its browser/WebView socket closes.
- Allow a later socket for the same project/session to reattach to the existing PTY.
- Ensure only explicit project switching, shutdown, or terminal termination kills the PTY.
- Preserve input, resize, output streaming, and active-terminal injection behavior after reattachment.
- Prevent duplicate PTYs when a client reconnects.
- Add lifecycle and reconnect tests; do not introduce tmux or another external dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `embedded-terminal`: WebSocket disconnects no longer terminate the server-owned PTY; reconnects reuse it.

## Impact

- `server/sync/pty.ts` live-terminal registry and socket lifecycle.
- WebSocket attach/reconnect handling and client connection identity.
- Project-switch and server-shutdown cleanup paths.
- Embedded terminal tests and dashboard reconnect behavior.
