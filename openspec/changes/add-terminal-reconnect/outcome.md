# Outcome: add-terminal-reconnect

## Worked

- The React remount pattern (`<Terminal key={terminalRestartCounter} />`) is clean and surgical — the existing mount/unmount lifecycle in `Terminal.tsx` required zero modification for the reconnect mechanic. WS close and xterm dispose happen naturally on unmount, and a fresh WS + xterm come up on remount.
- Server-side PTY cleanup was already correct: `server/sync/pty.ts` had `ws.on("close", () => { live.splice(i, 1); term.kill(); })` in place. No server changes needed (tasks 5.1 + 5.2 were verify-only).
- The `connected: boolean` state in `Terminal.tsx` hooks into the existing `ws.onopen` / `ws.onclose` / `ws.onerror` callbacks without adding any extra complexity.
- The keydown guard (`document.activeElement` inside `.terminal-host` OR the `.terminal-reconnect` button itself) correctly scopes the `Cmd/Ctrl+Shift+K` shortcut without touching xterm.js internals. xterm.js passes unhandled modifier combos through to the DOM, so the listener fires cleanly.
- Electron IPC bridge (`ithyno:terminal-restart`) is layered on the existing preload pattern without modifying any main-process logic beyond the menu item.
- `npm run typecheck`, `npm test` (297 tests, 0 failures), and `npm run build` all pass.
- `npm run openspec -- validate add-terminal-reconnect --strict` passes.

## Surprises

- The worktree did not contain the `openspec/changes/add-terminal-reconnect/` directory (the change files lived only in the main repo's untracked working tree). They were copied in manually before running validation.
- The Electron preload previously only exposed `openspecUI`; adding a second `contextBridge.exposeInMainWorld('ithyno', ...)` required importing `IPC_TERMINAL_RESTART` from `menu.ts` into `preload.ts`. Since both are compiled by the same Electron bundler step this import is fine, but it's worth noting that preload and menu share a single constant now.
- xterm.js renders inside a `<div ref>` host element; the reconnect button overlays it via `position: absolute`. The `.terminal-host` needed `position: relative` added to it — a small but required CSS tweak.

## Differently

- Task 4.5 (idempotency guard) does not require a debounce: the Electron accelerator sends the IPC message asynchronously through the main process, so the renderer keydown and the IPC callback never fire in the same synchronous tick. React would batch two closely-timed `restartTerminal()` calls into two separate renders (counter N→N+1→N+2), but each results in only one xterm remount. The net effect is correct; a formal debounce would add complexity without improving behavior.
- The `↻` glyph is rendered via `&#x21BB;` (HTML entity) rather than a Unicode literal in the JSX source, which avoids any source-encoding assumptions.

## Follow-ups

- The reconnect button overlays the top-right corner of the xterm canvas. If the terminal prompt ever renders content directly under that corner (rare, but possible on narrow widths), the button could occlude text. A future pass could move it to the `.terminal-head` bar instead, where it sits outside the canvas.
- The `IPC_TERMINAL_RESTART` constant is now shared between `menu.ts` and `preload.ts` via a direct import. If the preload ever needs to be fully decoupled from menu internals, consider extracting shared IPC channel names to a dedicated `ipc-channels.ts` file.
- No telemetry is wired (intentional per spec). If reconnect frequency ever becomes a signal worth tracking (for diagnosing flaky PTY conditions), a simple in-memory counter already exists (`terminalRestartCounter`) and could be surfaced in a debug panel without a new store field.
