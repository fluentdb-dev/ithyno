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
- Execute kill-pane, kill-window, kill-session, detach, or other destructive shortcuts in the initial version.
- Replace tmux's full command palette or configuration system.
- Add tmux chrome to VS Code delegated terminals.

## Decisions

### Use a shared typed action catalog

Define a catalog whose stable action IDs map to group, label, displayed shortcut, required capability, destructive/reference-only state, and server operation. The UI renders from this catalog so shortcut documentation and executable behavior cannot silently drift.

The initial executable set is:

- window navigation: next, previous, and last window;
- pane navigation: left, right, up, and down;
- layout: create window, split left/right, split top/bottom, toggle pane zoom, and cycle layout;
- client-only helpers: refresh topology and open the selected pane's retained history.

Destructive shortcuts may be listed for learning purposes but are marked reference-only and have no executable server mapping.

### Execute semantic actions, not simulated keystrokes

Add one authenticated project-scoped action endpoint accepting only a catalog action ID. The server resolves the canonical project session and translates the ID to a fixed tmux argument vector. It does not pass through user-supplied command names, flags, targets, or shell text.

This is safer and more deterministic than writing `Ctrl-b` sequences into the Manager PTY, which could reach the child CLI when prefix handling or timing differs.

### Reuse the topology adapter and provider capability model

Action execution lives beside the tmux topology adapter. Each provider reports the supported action IDs. The UI disables unsupported actions and explains the limitation. tmux receives the complete initial executable set; psmux exposes only operations proven compatible by adapter tests.

### Refresh after action completion

After a successful action, the client fetches a fresh topology snapshot and updates active window/pane state. The terminal WebSocket and PTY are not recreated. Errors remain in the cheat-sheet panel and do not close or restart the terminal.

### Keep destructive operations reference-only

Killing a pane or window can terminate the Manager and requires reliable Manager-pane identity plus recovery semantics. Until those contracts exist, destructive shortcuts are visible as documentation but cannot be invoked from ithyno.

## Risks / Trade-offs

- [The shortcut catalog can differ from a user's remapped tmux prefix or key table] → Label entries as default tmux bindings and keep semantic action execution independent of key bindings.
- [Rapid repeated clicks can reorder topology mutations] → Disable action controls while a request is pending and serialize server operations per project session.
- [psmux compatibility is incomplete] → Report per-action capabilities and disable unverified operations instead of assuming tmux parity.
- [A newly created window or pane can change the visible Manager target] → Refresh topology after execution and preserve the underlying tmux client/PTY rather than creating a new terminal connection.
