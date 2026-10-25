# tmux Session Browser and Interactive Cheat Sheet

## Opening the tmux browser

When the embedded Manager terminal is attached to an ithyno-managed tmux session, two **tmux control buttons** appear next to the terminal reconnect button:
- **tmux** — Opens the session browser to view and select windows and panes.
- **Shortcuts** — Opens the interactive cheat sheet with common tmux actions and their key sequences.

These controls open independently; you can browse windows without opening the shortcuts, or view the shortcuts without browsing the topology.

## Session Browser

The session browser displays the current project's tmux windows and panes. Ithyno derives the session from the current project and does not enumerate or control unrelated personal tmux sessions.

**Supported operations in the browser:**
- **Select a window or pane** — Click a window tab or pane name to switch to it without restarting the Manager, PTY, or dashboard connection.
- **Refresh topology** — Click Refresh to fetch the latest window and pane list.
- **Open pane history** — Click History next to a pane to view its captured plain-text output.

## Retained Pane History

Each pane has a **History** action. The viewer captures a bounded plain-text snapshot from tmux and provides browser-native scrolling, search, selection, refresh, and copy.

This history is separate from xterm.js scrollback. tmux may retain output from before a dashboard reconnect or from a window that was not visible in the embedded terminal. Opening History does not enter tmux copy mode or send input to the running agent CLI. Captured snapshots are not written to disk.

## Interactive Shortcuts (Cheat Sheet)

The cheat sheet groups tmux shortcuts by purpose and shows whether each entry is available on your system. Click any executable action to run it without typing the shortcut.

**Shortcut notation:**
- `Ctrl+B → n` means: press Ctrl+B, release it, then press n
- `Ctrl+B → Left Arrow` means: press Ctrl+B, release it, then press the left arrow key

**Action categories:**

### Navigation
- **Next window** (`Ctrl+B → n`) — Move to the next tmux window.
- **Previous window** (`Ctrl+B → p`) — Move to the previous tmux window.
- **Last window** (`Ctrl+B → l`) — Return to the most recent tmux window.
- **Move left/right/up/down** (`Ctrl+B → Arrow Key`) — Select the pane in that direction.

### Window and Pane Layout
- **Create window** (`Ctrl+B → c`) — Create a new tmux window in the current project session.
- **Split left/right** (`Ctrl+B → %` / `Ctrl+B → "`) — Split the active pane horizontally or vertically.
- **Split top/bottom** — Split the active pane above or below (provider-specific).
- **Toggle zoom** (`Ctrl+B → z`) — Enlarge or restore the active pane.
- **Cycle layout** (`Ctrl+B → Space`) — Cycle through available pane arrangements.

### Session Control
- **Stop session** — Stop the Manager and every window and pane in the current project session. Clicking this action requires an inline confirmation. It does not merely hide the tmux panel.

### Reference-Only Shortcuts
- **Kill pane** (`Ctrl+B → x`) and **Kill window** (`Ctrl+B → &`) are shown for reference only and are not executable from ithyno. Use the dedicated **Stop session** action to stop the Manager and all project windows and panes when needed.

## Capability Awareness

On Windows or other platforms with limited tmux compatibility (such as psmux), ithyno reports detected capabilities and disables unsupported controls while leaving the embedded terminal usable. For example, if your psmux version does not support window creation or pane splitting, those actions will appear grayed out with an explanatory message.

## Project Scoping

All cheat-sheet actions (create, split, navigate, layout, close, stop session) operate only within the current project's ithyno-managed tmux session. Cross-project sessions are never affected. The server validates all targets against the canonical project topology and rejects requests for unavailable panes or sessions.

## Initial Operation Scope

The browser and cheat sheet support topology refresh, window and pane selection, history inspection, and a pane-specific close confirmation that stops only that pane's running process. An explicit session-level control, "Stop session", stops the Manager and every window and pane in the current project session when confirmed.