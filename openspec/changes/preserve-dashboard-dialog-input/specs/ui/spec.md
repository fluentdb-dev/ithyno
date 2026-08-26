## ADDED Requirements

### Requirement: Dialog Input Survives Ordinary Focus Changes

The dashboard SHALL keep the active route, any open dialog, and unsaved values in that dialog mounted when the application window loses and regains focus or when document visibility returns to `visible` while the dashboard connection is healthy.

Focus and visibility events MUST NOT unconditionally reload workspace state. When the dashboard is disconnected, recovery MAY reconnect and refresh state without replacing the application shell. The shell SHALL reload only after an explicit authentication rejection, not after a network exception or non-authentication server failure.

#### Scenario: Healthy dashboard regains focus

- **GIVEN** a dashboard with a connected WebSocket and an open Agent configuration dialog containing unsaved text
- **WHEN** the window loses focus and later regains focus
- **THEN** the workspace loader is not invoked solely because of the focus event
- **AND** the same dialog remains open with the unsaved text unchanged

#### Scenario: Hidden healthy dashboard becomes visible

- **GIVEN** a connected dashboard with an open dialog
- **WHEN** the document visibility changes from hidden to visible
- **THEN** the active route and dialog remain mounted
- **AND** no shell reload occurs

#### Scenario: Disconnected dashboard becomes visible

- **GIVEN** the dashboard connection is marked disconnected
- **WHEN** the document becomes visible
- **THEN** the dashboard attempts a coalesced recovery
- **AND** successful recovery reconnects and refreshes state without closing the active dialog

#### Scenario: Authentication probe is temporarily unavailable

- **GIVEN** an open dialog and a recovery-time authentication probe that fails due to a network exception or non-authentication server error
- **WHEN** recovery handles the result
- **THEN** the current shell is not reloaded
- **AND** the dialog and its unsaved input remain available

#### Scenario: Authentication is explicitly rejected

- **GIVEN** the server explicitly returns `401` or `403` for the dashboard session token
- **WHEN** recovery handles the rejection
- **THEN** the containing shell MAY recreate the session using its authoritative launch URL
- **AND** this exceptional reload is distinguishable from an ordinary focus refresh
