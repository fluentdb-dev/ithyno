---
verdict: pass
summary: "The lost-session overlay now appears only for a truly missing PTY, while automatic reconnect preserves live sessions and explicit reload immediately terminates the stale PTY before creating a fresh one."
findings: []

## Notes

The client now waits for an explicit session-status handshake from the server, halts auto-reconnect on a missing PTY, and shows the overlay only after the reattach window expires or the server reports a dead session. Reload keeps the stale PTY from lingering by sending an explicit terminate request before the new session key is opened.
