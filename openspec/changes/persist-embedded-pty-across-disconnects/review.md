---
verdict: pass
summary: "PTY recovery now requires an attachment handshake and retains a bounded reconnect deadline across transport churn."
findings: []
---

## Notes

- Fixed after the Electron runtime report following `cfcc1d3`.
- Transport open no longer resets the PTY attachment deadline; attached/reattached is the only recovery signal.
- A handshake watchdog covers sockets that open but never complete PTY attachment.
- Electron runtime verification found and fixed an additional identity mismatch: `WorkspaceState.root` points to `<project>/openspec`, while the PTY protocol requires `<project>`.
- After correcting the identity, a DevTools-driven Electron page reload retained exactly one PTY and displayed injected output through the reattached socket.
- The embedded PTY now removes inherited host-harness `NO_COLOR`, advertises true-color support, and replays a bounded ANSI output buffer on reattach.
- Electron runtime verification retained 29 rendered ANSI color spans across reload with no lost overlay or reconnect warning.
