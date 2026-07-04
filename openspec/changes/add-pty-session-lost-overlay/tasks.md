## 1. Client: detect PTY WS close

- [ ] 1.1 In `Terminal.tsx` (or wherever the `/pty` WS is created), attach `onclose` and `onerror` handlers
- [ ] 1.2 Flip a component-local `disconnected: boolean` state on close/error
- [ ] 1.3 Distinguish "user unmounted the terminal" from "server closed the socket" — do not surface the overlay on the former (the cleanup effect fires close intentionally)

## 2. Client: overlay markup + CSS

- [ ] 2.1 Absolutely-positioned overlay covering the xterm container when `disconnected === true`
- [ ] 2.2 Dimmed backdrop (`rgba(0,0,0,0.6)`) + centered card with message and Reload button
- [ ] 2.3 Message text: "Terminal session ended — reload to reconnect."; button label: "Reload terminal"

## 3. Client: reload gesture

- [ ] 3.1 `Reload terminal` handler: dispose current xterm instance + close current WS ref, then re-run the mount effect (dispose the effect's cleanup, re-init from scratch)
- [ ] 3.2 New xterm instance mounts, new WS opens, fresh shell — do not attempt to restore scrollback

## 4. Spec delta

- [ ] 4.1 `openspec/changes/add-pty-session-lost-overlay/specs/dashboard/spec.md`: MODIFIED requirement covering the embedded-terminal's disconnect handling

## 5. Verification

- [ ] 5.1 Open the embedded terminal, run `sleep 30`, restart the server (`kill <pid>` or edit `server/*.ts` under `dev`); within seconds the overlay appears
- [ ] 5.2 Click Reload terminal → overlay disappears → fresh prompt appears → typing works
- [ ] 5.3 Deliberately unmounting the terminal pane (via the toggle) does NOT surface the overlay (regression: cleanup-close is not a disconnect)
- [ ] 5.4 Multiple back-to-back reloads work (no leaked xterm instances, no ghost WS)
