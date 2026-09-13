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
- Implemented explicit replay-start/replay-end wire protocol boundary messages.
- Client queues a write buffer barrier using term.write("", callback) when replay-end arrives. This ensures the callback fires only after xterm's WriteBuffer has processed all prior writes, including any xterm-generated terminal query responses to the replayed ANSI. The callback clears suppression, allowing normal input forwarding to resume.
- Refactored suppression as a stateful `createTerminalReplayInputGate()` factory returning an interface with begin/finish/shouldForward/reset methods. finish() takes an enqueueBarrier callback, enabling tests to capture the barrier callback without executing it.
- Input suppression prevents terminal query responses from corrupting shell input during replay. Tests exercise the gate state machine: begin() suppresses, finish(fn) keeps suppression active until done callback invoked, shouldForward() returns true/false per state, reset() clears state.
- Verified gate logic with unit tests, replay protocol framing, and component cleanup.
