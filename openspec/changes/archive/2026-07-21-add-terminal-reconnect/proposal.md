---
tags: [terminal, pty, ui, electron, dashboard, keyboard-shortcut]
execution: worktree
---

## Why

The embedded terminal pane opens exactly one `/pty` WebSocket at mount
and never reconnects. When the socket closes — network hiccup,
Claude Code exiting non-zero, PTY process crashing, sleep/wake on
laptop, agmsg tmux pane detach — the terminal writes
`\r\n[disconnected]` (`Terminal.tsx:69`) and becomes dead until the
user reloads the whole window. On the web shell that means Cmd/Ctrl+R
(browser reload), which throws away all React state — active
modals, unsaved Settings edits, kanban card selection, live-panel
subscriptions. On the Electron shell the same accelerator
(`electron/src/menu.ts:88`, `role: 'reload'`) tears down the entire
`BrowserWindow`. Both are massively over-scoped for a dead PTY.

The user has asked for a way to restart **just** the terminal (and
its backing PTY) with a keystroke, leaving the rest of the dashboard
untouched. `F5` was considered as the trigger but is deliberately
NOT bound — in the web shell it collides with the browser's page
reload, and even in the Electron shell binding it would create a
web / desktop mental-model mismatch (same key = different scopes).
Instead, both shells use the same key: **`Cmd/Ctrl+Shift+K`** when
the terminal has focus, plus a visible reconnect button as the
discoverable path.

## What Changes

- **`useStore` gains a `terminalRestartCounter: number` + `restartTerminal()` action.** Bumping the counter is the single mechanism that triggers a fresh terminal.
- **`<Terminal key={terminalRestartCounter} />`** at the App-level mount. React remounts the component on key change — the existing mount-only `useEffect` cleanup runs (closes WS, disposes xterm), then a fresh mount opens a new WS to `/pty` and creates a new xterm. No new lifecycle code inside `Terminal.tsx` itself.
- **Reconnect button** in the terminal chrome — small `↻` icon at the top-right of the terminal-host, visible on ALL states (not only disconnected). Clicking it calls `restartTerminal()`. When the WS is closed the button gets a prominent `terminal-reconnect-warn` style so the user notices; the click is the same.
- **Keyboard shortcut** (both shells): **`Cmd/Ctrl+Shift+K`** — bound at App level via `keydown` listener, but only while `document.activeElement` is inside the `.terminal-host` OR the reconnect button. `F5` is NOT bound on either shell (see Why).
- **Electron menu item**: `View → Reload Terminal` with the `CmdOrCtrl+Shift+K` accelerator for menu discoverability. No `F5` binding.
- **Server-side**: verify that when a `/pty` WebSocket closes, the spawned PTY is killed (child process cleanup). If not, restarting would leak zombie PTYs; the change adds cleanup if missing. (Research task — likely already correct.)
- **Reconnect count telemetry-free**: track only in memory (for the reconnect button's visible state); no logs, no metrics.

## Success

- After a `[disconnected]` line appears in the terminal, the user clicks the `↻` button (or presses `Cmd/Ctrl+Shift+K` with terminal focused, on either shell) — a fresh terminal session appears within ~200 ms, the shell prompt returns, and no other page state is lost (kanban selection, modal open state, live-panel subs all persist).
- Pressing `F5` in the web browser still triggers a normal browser reload (unchanged) — the change does NOT intercept web `F5`.
- Pressing `F5` in the Electron window is unchanged (no new binding); the existing `CmdOrCtrl+R` still triggers the full window reload.
- The reconnect button is visible when the terminal is connected too — clicking it restarts the terminal deliberately (e.g., after a Claude Code session got stuck). Not gated on disconnect.
- After a restart, no zombie `/pty` PTY process remains from the previous session (`ps` / OS process list is clean).
- Restarting the terminal does NOT re-fire any dashboard state fetch (no `/api/state`, `/api/about`, etc. re-request) — only the terminal is scoped by the operation.
