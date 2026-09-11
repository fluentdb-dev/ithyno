---
verdict: needs-rework
summary: "PTY detach/reload semantics are implemented and covered by lifecycle tests; Manager review is still outstanding."
findings: []
---

## Notes

- Generic unmount detaches the socket without terminating the PTY.
- Explicit Reload sends a restart request that terminates only the current PTY and creates a fresh one.
- Reconnect requires an existing PTY; fresh launch is explicit via create intent.
- Shutdown now calls `terminateAllLivePtys()` so the server cleans up live PTYs.
