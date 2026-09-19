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
- Real reconnect testing discovered a serious replay bug: buffered ANSI containing terminal query sequences (cursor position, color queries, device attributes) triggered xterm.js to emit responses through onData, which were forwarded to the PTY, corrupting shell input.
- Implemented explicit replay-start/replay-end wire protocol boundary messages with xterm write-buffer barrier for timing safety.
- Refactored suppression as a stateful `createTerminalReplayInputGate()` with generation-safe callbacks: stale callbacks from prior reconnects cannot interfere with current replay suppression.
- Fixed duplicate content on transient reconnect with reset-then-replay design:
  - Always send replay buffer on reattach (unconditional).
  - Client tracks attachment state via `createTerminalReplayController()`: on first replay-start (initial attach), does not reset (xterm already empty); after markAttached(), each replay-start calls term.reset() to create truly empty terminal state before replay content, removing old screen and '[reconnecting…]' marker.
  - term.reset() creates an empty terminal state (unlike term.clear() which retains the current prompt line).
  - Manual reconnect via reconnectAttempt creates a fresh effect instance with unattached controller, so initial replay does not reset.
- Server always calls replayTerminalOutput() on reattach; removed conditional wantReplay URL parameter, parser, and option.
- Tests verify: server sends replay unconditionally on reattach with replay-start/replay-end boundaries; client controller distinguishes initial attach (no reset) from reconnect (reset once per replay-start); replay-end still holds suppression until term.write barrier callback fires; stale gate generations cannot interfere.
