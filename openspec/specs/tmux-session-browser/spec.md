# tmux-session-browser Specification

## Purpose
TBD - created by archiving change add-tmux-session-browser-and-history. Update Purpose after archive.
## Requirements
### Requirement: Project-scoped tmux topology
The system SHALL expose structured topology only for the ithyno tmux session derived from the current canonical project root, including its windows, panes, active selection, titles, dimensions, and layout identifiers.

#### Scenario: Project session exists
- **WHEN** the authenticated local dashboard requests tmux topology and the current project's derived session exists
- **THEN** the response contains that session's windows and panes with stable identifiers and active-state markers
- **AND** it does not include unrelated user tmux sessions

#### Scenario: Project session is absent
- **WHEN** tmux is installed but the current project's derived session does not exist
- **THEN** the response reports an available tmux provider with no active project session
- **AND** the embedded terminal continues to operate normally

#### Scenario: tmux is unavailable
- **WHEN** no compatible tmux or psmux command is available
- **THEN** the response reports tmux as unavailable with selection and history capabilities disabled
- **AND** the dashboard does not present failing tmux actions

### Requirement: Safe tmux target selection
The system SHALL allow the authenticated local dashboard to select a window or pane only when the requested target belongs to the current project's freshly resolved tmux topology.

#### Scenario: Select an existing window
- **WHEN** the user selects a listed tmux window
- **THEN** the server selects that window in the current project session
- **AND** the refreshed topology identifies it as active
- **AND** the existing PTY and WebSocket remain connected

#### Scenario: Select an existing pane
- **WHEN** the user selects a listed tmux pane
- **THEN** the server selects the pane and its containing window in the current project session
- **AND** the existing PTY and WebSocket remain connected

#### Scenario: Reject an unknown target
- **WHEN** a selection request names a window or pane not present in a fresh topology snapshot for the current project session
- **THEN** the server rejects the request without invoking a tmux selection command

### Requirement: Scrollable pane history
The system SHALL provide bounded, plain-text tmux pane history that users can scroll, search, select, refresh, and copy without entering tmux copy mode or changing the interactive terminal state.

#### Scenario: Open history for a listed pane
- **WHEN** the user opens History for a pane that belongs to the current project session
- **THEN** the server captures bounded history for that pane
- **AND** the dashboard displays it in a scrollable text viewer
- **AND** the current terminal window and pane selection are unchanged

#### Scenario: Search captured history
- **WHEN** the user enters a search term in an open history viewer
- **THEN** matching lines are identified without sending input to the PTY or tmux pane

#### Scenario: Refresh captured history
- **WHEN** the user refreshes an open history viewer
- **THEN** the dashboard requests a new bounded capture for the same validated pane
- **AND** it replaces the prior snapshot without persisting either snapshot to disk

#### Scenario: Capture exceeds configured bounds
- **WHEN** a tmux pane contains more history than the configured line or byte limit
- **THEN** the server returns only the bounded tail and indicates that the capture was truncated

### Requirement: Capability-aware tmux UI
The system SHALL render tmux controls according to capabilities reported by the server and SHALL preserve existing terminal behavior when an operation is unsupported.

#### Scenario: Full tmux capabilities
- **WHEN** topology, selection, and capture are supported
- **THEN** the terminal header offers the session browser, target selection, and History actions

#### Scenario: History unsupported by provider
- **WHEN** a detected psmux provider can list and select targets but cannot capture pane history
- **THEN** the topology remains visible and selectable
- **AND** History controls are disabled with an explanatory reason

#### Scenario: VS Code delegated terminal mode
- **WHEN** the dashboard runs inside a VS Code webview where the embedded terminal is not mounted
- **THEN** the tmux browser is not mounted in the dashboard
- **AND** VS Code's terminal behavior remains unchanged

### Requirement: Non-destructive initial tmux surface
The tmux browser and cheat sheet SHALL support explicit user-confirmed close and kill operations for panes and the entire project session—limited to the current ithyno-managed project session. The server also exposes allowlisted create and split actions constrained to that same session. All targets are validated against the current canonical project's topology and cross-project or arbitrary session/pane targets are rejected.

#### Scenario: Browse a managed session
- **WHEN** the user opens the tmux browser
- **THEN** refresh, selection, history, search, and copy operations are always available
- **AND** executable actions (create, split, navigate, zoom, layout) and explicit pane/session close actions are shown according to provider support
- **AND** actions execute only within the current project's tmux session

#### Scenario: Confirm before destructive pane action
- **WHEN** a user invokes a close action for a pane
- **THEN** the system requires inline confirmation, names that pane, and warns that its running process will stop
- **AND** the action executes only after explicit confirmation with a validated pane ID from the current project topology

#### Scenario: Confirm before destructive session action
- **WHEN** a user invokes a kill action for the entire project session
- **THEN** the system requires explicit confirmation, names the session, and warns that it stops the Manager and every window and pane
- **AND** the action executes only after explicit confirmation

#### Scenario: Reject cross-project targets
- **WHEN** a close or kill request names a pane or session that does not belong to the current canonical project's topology
- **THEN** the server rejects the request without invoking tmux

