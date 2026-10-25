## Why

Ithyno can keep a Manager alive inside a project-scoped tmux session, but the dashboard treats tmux as an invisible launch wrapper. Users cannot see which tmux windows or panes exist, switch to the terminal that belongs to a Manager or Worker, or reliably inspect history that is held by tmux rather than xterm.js.

## What Changes

- Add a read-only tmux browser for ithyno-managed sessions, windows, and panes, with active-state and pane-layout context.
- Allow users to select an existing tmux window or pane from the embedded terminal UI without typing tmux key sequences.
- Add a pane-history drawer backed by tmux history, with scrolling, refresh, search, selection, and copy support.
- Detect tmux/psmux capabilities and hide or disable unsupported controls instead of assuming full Unix tmux compatibility.
- Keep the initial surface non-destructive: it does not create, split, rename, kill, or reorder tmux windows and panes.

## Capabilities

### New Capabilities

- `tmux-session-browser`: Discover and visualize ithyno-managed tmux sessions, navigate their windows and panes, and inspect captured pane history from the dashboard.

### Modified Capabilities

None.

## Impact

- Adds a server-side tmux adapter and authenticated local API endpoints for structured topology, selection, and history capture.
- Extends the embedded terminal header with tmux navigation and a history drawer in standalone browser and Electron runtimes.
- Adds platform capability reporting so Windows psmux can expose only the operations it supports.
- Adds tests around command construction, project/session isolation, API validation, UI navigation, and history rendering.
