## Context

`add-tmux-session-browser-and-history` introduces project-scoped topology discovery, target selection, and retained-history viewing. Its initial UI is intentionally read-only apart from selection. Users can see tmux state but still need to remember prefix shortcuts for common navigation and layout operations.

This change depends on that foundation. It adds a discoverable shortcut reference and a bounded action layer without turning the ithyno server into a general tmux command proxy. Electron and browser-hosted embedded terminals are in scope; VS Code delegated terminals remain owned by the host editor.

## Goals / Non-Goals

**Goals:**

- Show a compact, grouped tmux shortcut reference inside the existing tmux browser.
- Let users invoke common non-destructive navigation and layout actions by clicking their cheat-sheet entries.
- Keep every server-side action project-scoped, typed, timeout-bounded, and explicitly allowlisted.
- Report provider support per action and refresh topology after successful execution.
- Preserve the Manager PTY, WebSocket attachment, terminal size, and dashboard state.

**Non-Goals:**

- Accept arbitrary tmux commands, command fragments, key sequences, or client-supplied session names.
- Expose the cheat-sheet kill-pane or kill-window shortcuts as directly executable actions. Those entries remain reference-only; pane termination is available only through the pane row's explicit, confirmed, topology-validated close control.
- Replace tmux's full command palette or configuration system.
- Add tmux chrome to VS Code delegated terminals.

## Decisions

### Use a shared typed action catalog

Define a catalog whose stable action IDs map to group, label, displayed shortcut, required capability, destructive/reference-only state, and server operation. The UI renders from this catalog so shortcut documentation and executable behavior cannot silently drift.

The executable set includes the current project session close action alongside standard navigation and layout actions:

- window navigation: next, previous, and last window;
- pane navigation: left, right, up, and down;
- layout: create window, split left/right, split top/bottom, toggle pane zoom, and cycle layout;
- session control: close the current canonical project tmux session;
- client-only helpers: refresh topology and open the selected pane's retained history.

Pane- and window-kill shortcuts remain visible for learning purposes but stay reference-only and have no direct executable server mapping. A separate `close-pane` semantic action is available only from a concrete pane row; it requires confirmation and validates that pane against the current project session before executing the fixed kill operation.

### Execute semantic actions, not simulated keystrokes

Add one authenticated project-scoped action endpoint accepting only a catalog action ID. The server resolves the canonical project session and translates the ID to a fixed tmux argument vector. It does not pass through user-supplied command names, flags, targets, or shell text.

This is safer and more deterministic than writing `Ctrl-b` sequences into the Manager PTY, which could reach the child CLI when prefix handling or timing differs.

### Reuse the topology adapter and provider capability model

Action execution lives beside the tmux topology adapter. Each provider reports the supported action IDs. The UI disables unsupported actions and explains the limitation. tmux receives the complete initial executable set; psmux exposes only operations proven compatible by adapter tests.

### Refresh after action completion

After a successful action, the client fetches a fresh topology snapshot and updates active window/pane state. The terminal WebSocket and PTY are not recreated. Errors remain in the cheat-sheet panel and do not close or restart the terminal.

### Support closing the current project session explicitly

Closing the current project session is a controlled, project-scoped action: it stops the Manager and all windows/panes in the derived session, while a pane or window kill remains intentionally reference-only. The server resolves the canonical tmux session name from the current project root and executes only the fixed `kill-session -t <canonical-name>` argv without accepting any client-provided session target.

## Risks / Trade-offs

- [The shortcut catalog can differ from a user's remapped tmux prefix or key table] → Label entries as default tmux bindings and keep semantic action execution independent of key bindings.
- [Rapid repeated clicks can reorder topology mutations] → Disable action controls while a request is pending and serialize server operations per project session.
- [psmux compatibility is incomplete] → Report per-action capabilities and disable unverified operations instead of assuming tmux parity.
- [A newly created window or pane can change the visible Manager target] → Refresh topology after execution and preserve the underlying tmux client/PTY rather than creating a new terminal connection.
