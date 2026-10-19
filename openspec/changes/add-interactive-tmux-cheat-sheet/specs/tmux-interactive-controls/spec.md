## ADDED Requirements

### Requirement: Interactive tmux cheat sheet
The embedded terminal SHALL provide a cheat sheet for an available ithyno-managed tmux session that groups default tmux shortcuts by purpose and identifies whether each entry is executable, unsupported by the active provider, or reference-only.

#### Scenario: Open the cheat sheet
- **WHEN** a user opens the cheat sheet from the tmux session browser
- **THEN** the system displays grouped actions with a human-readable label and the corresponding default tmux shortcut

#### Scenario: Reference-only destructive shortcut
- **WHEN** the cheat sheet displays a destructive shortcut such as killing a pane, window, or session
- **THEN** the system marks it as reference-only and does not provide an executable action

### Requirement: Allowlisted semantic tmux actions
The server MUST accept only stable, predefined tmux action IDs and MUST translate each accepted ID into a fixed subprocess argument vector without executing a shell or accepting client-provided tmux commands, flags, key sequences, or session names.

#### Scenario: Execute a supported navigation action
- **WHEN** a user invokes next window, previous window, last window, or directional pane navigation from the cheat sheet
- **THEN** the server performs the corresponding action within the current canonical project's ithyno-managed tmux session

#### Scenario: Execute a supported layout action
- **WHEN** a user invokes create window, split left/right, split top/bottom, toggle pane zoom, or cycle layout
- **THEN** the server performs only the fixed allowlisted tmux operation within the current canonical project's session

#### Scenario: Reject an unknown action
- **WHEN** a client submits an action ID that is not in the executable catalog
- **THEN** the server rejects the request without spawning tmux or changing session state

#### Scenario: Reject injected arguments
- **WHEN** a client includes a session name, tmux command, flag, target, shell fragment, or other undeclared action input
- **THEN** the server rejects the request without passing that input to a subprocess

### Requirement: Project-scoped action execution
Every executable cheat-sheet action MUST resolve its tmux session from the server's canonical current project root and MUST NOT operate on another tmux session.

#### Scenario: Multiple projects have active sessions
- **WHEN** two ithyno projects have tmux sessions and one project invokes a cheat-sheet action
- **THEN** only the invoking project's derived session changes

#### Scenario: Current project session is unavailable
- **WHEN** an action is requested while the current project's managed tmux session does not exist
- **THEN** the server returns an explicit unavailable result and does not fall back to another session

### Requirement: Capability-aware actions
The system SHALL expose provider support per action and SHALL prevent invocation of actions that the active tmux-compatible provider has not declared supported.

#### Scenario: Provider does not support an action
- **WHEN** the active provider does not advertise support for a cheat-sheet action
- **THEN** the UI disables the action, explains that it is unsupported, and sends no execution request

#### Scenario: Server receives an unsupported provider action
- **WHEN** an action request bypasses the UI but the active provider does not support that action
- **THEN** the server rejects it without changing session state

### Requirement: Non-disruptive action lifecycle
The client SHALL serialize action requests, display pending and failure states, and refresh topology after success without recreating the Manager PTY, terminal WebSocket, or dashboard page.

#### Scenario: Action succeeds
- **WHEN** an executable cheat-sheet action completes successfully
- **THEN** the client refreshes window and pane topology and reflects the new active or layout state while retaining the existing terminal connection

#### Scenario: Action fails
- **WHEN** an executable cheat-sheet action times out or returns an error
- **THEN** the client reports the failure in the cheat-sheet panel and leaves the Manager terminal usable

#### Scenario: Repeated click while pending
- **WHEN** an action request is already in progress
- **THEN** additional action controls remain disabled until the request completes

### Requirement: Client-side helper actions
The cheat sheet SHALL include entries for topology refresh and retained-history viewing that invoke existing client behavior without creating a server-side tmux action.

#### Scenario: Refresh from the cheat sheet
- **WHEN** a user invokes refresh topology
- **THEN** the client obtains and renders a fresh topology snapshot

#### Scenario: Open history from the cheat sheet
- **WHEN** a user invokes retained history for the selected pane
- **THEN** the client opens the existing bounded history viewer for that pane
