# Tasks

## 1. Store + restart mechanism

- [x] 1.1 In `web/src/store.ts`, add `terminalRestartCounter: number` (initial `0`) and `restartTerminal: () => void` action that bumps the counter by 1.
- [x] 1.2 In `web/src/App.tsx`, replace `<Terminal />` with `<Terminal key={terminalRestartCounter} />` reading the counter from the store.
- [x] 1.3 Confirm `Terminal.tsx`'s cleanup effect (existing `return () => { ws.close(); term.dispose(); ... }`) already handles WS + xterm teardown correctly on unmount — remount will invoke it, then run the mount effect on the new instance.

## 2. Reconnect button + connection-state indicator

- [x] 2.1 In `Terminal.tsx`, add `connected: boolean` state; set `true` on `ws.onopen`, `false` on `ws.onclose` / `ws.onerror`.
- [x] 2.2 Render a `<button className="terminal-reconnect">↻</button>` positioned top-right inside `.terminal-host` (absolutely positioned). Clicks call `useStore.getState().restartTerminal()`.
- [x] 2.3 When `!connected`, add class `terminal-reconnect-warn` — accent color + subtle pulse, so disconnect is discoverable.
- [x] 2.4 Style `.terminal-reconnect` in `web/src/styles.css` — small (~24×24 px), subtle border, both light + dark palette. `.terminal-reconnect-warn` variant uses `--accent` / warning color.
- [x] 2.5 `title="Restart terminal (Cmd/Ctrl+Shift+K)"` for discoverability.

## 3. Web keyboard shortcut

- [x] 3.1 In `web/src/App.tsx`, add a global `keydown` listener that fires `restartTerminal()` on `Cmd/Ctrl+Shift+K` — but only when `document.activeElement` is inside `.terminal-host` OR is the `.terminal-reconnect` button. Prevent default only when we fire.
- [x] 3.2 Confirm the shortcut does not conflict with xterm.js's own bindings — xterm passes unhandled key combos through, so `Cmd/Ctrl+Shift+K` should be free.

## 4. Electron menu + accelerator

- [x] 4.1 In `electron/src/menu.ts`, add a new `View → Reload Terminal` menu item with label hint `⇧⌘K` (no accelerator registration — see spec design rationale). Do NOT bind `F5`.
- [x] 4.2 The menu item's `click` handler sends an IPC message (e.g. `webContents.send("ithyno:terminal-restart")`) to the renderer. The renderer's preload script exposes this on `window.ithyno.onTerminalRestart(cb)` (or reuses an existing event bridge).
- [x] 4.3 In `Terminal.tsx` (or better, in `App.tsx` alongside the keydown listener), subscribe to the IPC event when running under Electron and call `restartTerminal()`.
- [x] 4.4 Keep the existing `role: 'reload'` (Cmd/Ctrl+R) for full window reload — unchanged.
- [x] 4.5 Because both the web keydown handler AND the Electron menu accelerator can fire on the same key press within the Electron shell, ensure the handler is idempotent-per-tick (a debounced or dedup guard on `restartTerminal()` — bumping the counter twice in the same tick still yields a single remount because React coalesces).

## 5. Server-side PTY cleanup (verify + fix if missing)

- [x] 5.1 Read `server/index.ts` (or wherever `/pty` WebSocket handler lives) and confirm the spawned PTY child process is killed when the WS closes.
- [x] 5.2 If not, add `ws.on("close", () => ptyChild.kill())` (or equivalent for the runtime — likely `node-pty` `ptyProcess.kill()`). — Already present; no fix needed.
- [ ] 5.3 Manually verify: open dashboard → note PTY PID → click Reconnect → confirm old PID is gone (`ps -p <old>` returns empty), new PID exists.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate add-terminal-reconnect --strict` passes.
- [x] 6.2 `npm test` passes.
- [x] 6.3 `npm run typecheck` passes.
- [x] 6.4 `npm run build` passes.
- [ ] 6.5 Manual (web): open dashboard → click reconnect button → new prompt appears within ~200 ms; verify open modals / kanban selection are preserved.
- [ ] 6.6 Manual (web): kill the server's PTY externally (`kill <pid>`) → `[disconnected]` appears + button turns warn-style → click reconnect → shell returns.
- [ ] 6.7 Manual (web): press `Cmd/Ctrl+Shift+K` with terminal focused → restart fires. Press with focus elsewhere (e.g. Settings input) → no fire, no default prevention.
- [ ] 6.8 Manual (web): press `F5` in browser → normal page reload (unchanged behavior).
- [ ] 6.9 Manual (Electron): press `F5` → nothing happens (no binding). Press `Cmd/Ctrl+R` → full window reloads (unchanged).
- [ ] 6.10 Manual (Electron): press `Cmd/Ctrl+Shift+K` → terminal restarts. `View → Reload Terminal` menu item visible with the accelerator label; clicking it also restarts.
- [ ] 6.11 Manual: no PTY zombie remains after reconnect (checked via `ps`).
- [x] 6.12 Write `openspec/changes/add-terminal-reconnect/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
