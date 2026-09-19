## Outcome

The embedded Manager PTY now remains alive across transient Dashboard or
WebSocket disconnects and is reattached by a stable project/session identity.
Explicit restart, project switching, shutdown, PTY exit, and idle expiry still
perform deliberate cleanup.

Reconnects restore a bounded ANSI output buffer using replay boundaries. The
client suppresses terminal-generated replies during replay and resets the
existing xterm before rebuilding its display, preventing duplicated history or
terminal query responses from leaking into the shell.

Server lifecycle, client reconnect, replay, cleanup, and identity behavior are
covered by automated tests and were also verified in Electron.
