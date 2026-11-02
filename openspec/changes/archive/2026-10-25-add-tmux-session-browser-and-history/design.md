## Context

The Manager PTY can already be wrapped in a project-scoped tmux session, but ithyno neither queries tmux topology nor exposes tmux history. The browser sees only the currently attached tmux client. xterm.js keeps its own finite scrollback, while output retained in another tmux window or before a reattach remains inaccessible without entering tmux copy mode manually.

The feature must work in the standalone web/Electron terminal. VS Code mode delegates terminal rendering to the editor and therefore does not mount this UI. Unix tmux is the primary implementation target; Windows psmux must degrade according to probed command capabilities.

## Goals / Non-Goals

**Goals:**

- Show the current project's ithyno-managed tmux session, windows, panes, active selection, pane titles, dimensions, and layout.
- Select an existing window or pane without requiring tmux prefix commands.
- Read retained pane history in a scrollable, searchable, copyable dashboard drawer.
- Keep all tmux targets server-derived and constrained to the current project session.
- Report unavailable operations explicitly when tmux or a compatible psmux command is missing.

**Non-Goals:**

- A general-purpose browser for every tmux session owned by the OS user.
- Creating, splitting, renaming, reordering, or killing sessions, windows, or panes.
- Replacing the Agents page with a raw tmux pane manager.
- Enabling tmux automatically or changing existing `agents.yaml` settings.
- Guaranteeing feature parity for psmux commands that its installed version does not implement.

## Decisions

### Use a server-side adapter with structured argv

Add a tmux adapter that invokes `tmux` with argument arrays and bounded timeouts. It derives the only permitted session name from the canonical project root using the existing `tmuxSessionName()` function. The browser never supplies a session name or arbitrary tmux command.

This is safer than a generic command endpoint and keeps platform parsing, validation, and psmux degradation out of React components.

### Discover topology on demand

The adapter uses `has-session`, `list-windows`, and `list-panes` with stable format fields. The UI fetches topology when opened and after a selection operation; it does not run a permanent tmux control-mode client.

Control mode would provide richer events but adds a second long-lived process, compatibility risk with psmux, and lifecycle complexity disproportionate to a read-mostly browser. Periodic refresh can be added later if real-time topology changes prove necessary.

### Keep selection and history as separate operations

Selecting a window or pane changes the attached tmux client's active target. Capturing history uses `capture-pane` for an explicitly validated pane ID and returns plain text without changing interactive terminal state.

A history drawer is preferred over forcing tmux copy mode because it provides browser-native scrolling, search, selection, and clipboard behavior without stealing wheel input from interactive agent CLIs.

### Scope access to the project session and returned pane IDs

The topology endpoint returns only the session derived for the current project. Selection and history requests accept numeric window indexes or tmux pane IDs that must exist in a fresh topology snapshot for that session. Targets outside that snapshot are rejected.

This prevents the dashboard from becoming an unrestricted local tmux control surface.

### Expose capabilities instead of platform assumptions

Topology responses include `available`, `provider`, and operation capability flags. Missing tmux, a missing session, unsupported psmux commands, and execution failures are distinct states. React disables controls using these flags and presents a concise reason.

### Integrate with the existing terminal header

The terminal header gains a compact tmux button/status. Opening it shows window tabs and pane cards; selecting a target closes neither the PTY nor the WebSocket. A History action opens a drawer layered within the terminal area. Existing terminal sizing and reconnect behavior remain unchanged.

## Risks / Trade-offs

- **Format parsing differs between tmux and psmux** → Keep parsing isolated, probe commands, and return reduced capabilities rather than failing the terminal.
- **Topology may change between validation and action** → Revalidate immediately before selection/capture and return a conflict/not-found response.
- **Large histories can consume memory or block the server** → Enforce a line limit and output byte cap, and use a short subprocess timeout.
- **Pane contents may contain secrets** → Return history only to the authenticated local dashboard, never log captured text, and do not persist it in application state beyond the open drawer.
- **Changing the active pane may surprise another attached client** → The UI labels selection as affecting the current project tmux session and refreshes active markers after the operation.
- **CLI full-screen mouse handling varies** → History remains a separate viewer; the implementation does not globally enable tmux mouse mode.

## Migration Plan

No data migration is required. Existing projects with `tmux: true` gain the browser when a compatible tmux session exists. Projects without tmux behave exactly as before. Rollback removes the endpoints and UI without changing the tmux session or `agents.yaml`.

## Open Questions

- Whether a later Change should add safe creation/split/rename/close controls.
- Whether agmsg should annotate windows and panes with role/Change metadata at creation time rather than relying on title and cwd.
- Which psmux versions provide reliable `capture-pane` and formatting support; unsupported combinations will initially report reduced capabilities.
