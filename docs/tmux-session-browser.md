# tmux Session Browser and History

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

The initial browser is non-destructive. It supports topology refresh, window
and pane selection, and history inspection. It does not create, split, rename,
reorder, close, or kill tmux sessions, windows, or panes.

On Windows, the installed psmux version may implement only part of tmux's
command surface. Ithyno reports detected capabilities and disables unsupported
selection or history controls while leaving the embedded terminal usable.
