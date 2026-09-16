## 1. Client: detect PTY disconnects without false alarms

- [x] 1.1 In `Terminal.tsx`, track reconnect attempts and persistent disconnect state separately from a healthy web socket.
- [x] 1.2 Distinguish transient socket loss during automatic reattachment from a terminal session that is truly lost.
- [x] 1.3 Do not surface the overlay when the terminal is intentionally unmounted or the component is cleaning up.

## 2. Client: overlay markup + CSS

- [x] 2.1 Render an absolutely-positioned overlay covering the xterm container only when the session is lost.
- [x] 2.2 Use a dimmed backdrop and centered card with the message "Terminal session ended — reload to reconnect." and a "Reload terminal" button.
- [x] 2.3 Preserve the existing xterm beneath the overlay and keep the reconnect warning visible during the retry window.

## 3. Client: reload gesture

- [x] 3.1 `Reload terminal` fires the existing terminal restart flow so the current socket closes and a fresh PTY is spawned with a new session identity.
- [x] 3.2 The reload path intentionally drops stale state and creates a new xterm instance rather than trying to resume the dead session.

## 4. Spec delta

- [x] 4.1 `openspec/changes/add-pty-session-lost-overlay/specs/dashboard/spec.md`: MODIFIED requirement covering the terminal's reconnect versus session-lost semantics.

## 5. Verification

- [x] 5.1 A transient socket gap while automatic reattachment is in progress does not render the lost-session overlay.
- [x] 5.2 When the reattach window expires, the overlay appears and the Reload terminal action creates a fresh PTY.
- [x] 5.3 Deliberate unmounts remain silent and do not leak stale session-lost state.
- [x] 5.4 Repeated reloads succeed without leaving duplicate xterm or websocket instances alive.
