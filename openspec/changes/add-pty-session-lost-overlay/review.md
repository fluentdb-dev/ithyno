---
verdict: needs-rework
summary: "Session-lost overlay and PTY reconnect semantics are in place; final Manager review is still pending."
findings: []
---

## Notes

- The overlay only appears once the reconnect window expires.
- A clean unmount detaches without terminating the server PTY.
- Explicit Reload is the only path that terminates and recreates a PTY.
- Reconnect remains gated on an existing PTY, and lifecycle tests cover the expected behavior.
