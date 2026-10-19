# tmux Session Browser and History

The default tmux prefix is Ctrl+B; press Ctrl+B, release it, then press the
following key.

When the embedded Manager terminal is attached to an ithyno-managed tmux
session, a **tmux** control appears next to the terminal reconnect button. Open
it to see the current project's tmux windows and panes.

Selecting a window or pane changes the visible target without restarting the
Manager, PTY, or dashboard connection. Ithyno derives the session from the
current project and does not enumerate or control unrelated personal tmux
sessions.

## Retained pane history

Each pane has a **History** action. The viewer captures a bounded plain-text
snapshot from tmux and provides browser-native scrolling, search, selection,
refresh, and copy.

This history is separate from xterm.js scrollback. tmux may retain output from
before a dashboard reconnect or from a window that was not visible in the
embedded terminal. Opening History does not enter tmux copy mode or send input
to the running agent CLI. Captured snapshots are not written to disk.

## Initial operation scope

The initial browser is read-only except for explicit stop/close actions that are
scoped to the current project session. It supports topology refresh, window and
pane selection, history inspection, and a pane-specific close confirmation that
stops only that pane's running process. A separate session-level control, "Stop
session", stops the Manager and every window and pane in the current project
session; it never merely hides the panel.

Window and pane kill shortcuts remain reference-only in the cheat sheet. The
server validates the pane ID against the canonical project session topology
before running the fixed `kill-pane -t <verified-pane-id>` argv, and the
session-wide action remains limited to the current project session name.

On Windows, the installed psmux version may implement only part of tmux's
command surface. Ithyno reports detected capabilities and disables unsupported
selection or history controls while leaving the embedded terminal usable.
