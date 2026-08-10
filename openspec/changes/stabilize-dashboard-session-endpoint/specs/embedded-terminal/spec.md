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

#### Scenario: Only the authoritative port is available
- **GIVEN** `ITHYNO_BASE` is absent and the injected `ITHYNO_PORT` is present
- **WHEN** an ithyno command resolves the dashboard endpoint
- **THEN** it derives `http://localhost:<ITHYNO_PORT>` from that exact value
- **AND** it does not use a default or remembered port

#### Scenario: Dispatch has no authoritative session context
- **GIVEN** both `ITHYNO_BASE` and `ITHYNO_PORT` are absent, or `ITHYNO_SESSION_TOKEN` is absent
- **WHEN** the Manager starts an ithyno dispatch or diagnoses a failed server request
- **THEN** dispatch stops before contacting an endpoint
- **AND** it does not construct or retry a URL using a default or guessed port
- **AND** diagnostics may state whether the token is set but MUST NOT print the token value
