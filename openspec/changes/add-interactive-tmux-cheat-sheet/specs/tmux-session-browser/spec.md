## MODIFIED Requirements

### Requirement: Non-destructive initial tmux surface
The tmux browser and cheat sheet SHALL support explicit user-confirmed close and kill operations limited to the current ithyno-managed project session, plus allowlisted create and split actions constrained to that same session. The server validates all targets against the current canonical project's topology and rejects cross-project or arbitrary session/pane targets.

> ⚠️ **PENDING MODIFIED** by [add-interactive-tmux-cheat-sheet](../../changes/add-interactive-tmux-cheat-sheet/): Clarifies that create, split, and explicit close/kill actions for the current project session are now exposed through the interactive cheat sheet.

#### Scenario: Browse a managed session
- **WHEN** the user opens the tmux browser
- **THEN** refresh, selection, history, search, and copy operations are always available
- **AND** executable actions (create, split, navigate, zoom, layout) and explicit close actions are shown according to provider support
- **AND** actions execute only within the current project's tmux session

#### Scenario: Confirm before destructive action
- **WHEN** a user invokes a close or kill action for a window or session
- **THEN** the system requires inline confirmation, names the target, and warns about the consequences
- **AND** the action executes only after explicit confirmation with a validated target from the current project topology

#### Scenario: Reject cross-project targets
- **WHEN** a close or kill request names a pane or session that does not belong to the current canonical project's topology
- **THEN** the server rejects the request without invoking tmux
