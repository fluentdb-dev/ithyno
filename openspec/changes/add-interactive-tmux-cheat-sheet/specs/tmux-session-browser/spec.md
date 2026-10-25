## MODIFIED Requirements

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