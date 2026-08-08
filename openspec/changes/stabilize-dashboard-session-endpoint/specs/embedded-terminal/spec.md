## ADDED Requirements

### Requirement: Manager Receives Authoritative Dashboard Endpoint
The embedded PTY SHALL provide each Manager process with `ITHYNO_PORT`, `ITHYNO_BASE`, and `ITHYNO_SESSION_TOKEN` values that exactly identify the Manager's owning dashboard session.

#### Scenario: Manager starts in Electron dashboard session
- **WHEN** Electron opens the Manager PTY for a project dashboard session
- **THEN** `ITHYNO_PORT` equals the session's bound server port
- **AND** `ITHYNO_BASE` equals `http://localhost:<ITHYNO_PORT>`
- **AND** `ITHYNO_SESSION_TOKEN` equals the server's active session token

#### Scenario: Renderer reload does not stale Manager environment
- **GIVEN** a Manager process has inherited the authoritative dashboard endpoint
- **WHEN** the renderer reloads or performs authentication recovery
- **THEN** the inherited port and token continue to identify and authorize against the active server

#### Scenario: Explicit values do not fall back to default port
- **GIVEN** `ITHYNO_BASE` and `ITHYNO_PORT` are present in the Manager environment
- **WHEN** an ithyno command contacts the dashboard server
- **THEN** it uses the supplied endpoint and does not replace it with the default port `4321`
