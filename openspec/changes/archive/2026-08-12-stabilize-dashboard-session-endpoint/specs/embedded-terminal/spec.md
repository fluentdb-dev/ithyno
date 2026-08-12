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

#### Scenario: Session identity may have changed between requests
- **GIVEN** an ithyno workflow previously completed an authenticated HTTP request
- **WHEN** it is about to make another ithyno HTTP request
- **THEN** it explicitly reconsiders whether the dashboard or server restarted
- **AND** it expands the current `ITHYNO_BASE`, `ITHYNO_PORT`, and `ITHYNO_SESSION_TOKEN` values again rather than reusing copied literals
- **AND** after HTTP 401/403 or a transport failure it re-reads the environment once and retries only if the request values demonstrably changed
- **AND** an unchanged or invalid session stops the workflow without entering a worker or Manager-execution fallback

#### Scenario: Multi-change dispatch resolves session context
- **GIVEN** the Manager starts an ithyno multi-change dispatch
- **WHEN** its workflow resolves the dashboard endpoint and session token
- **THEN** it applies the same authoritative environment, no-default-port, token-secrecy, and per-request freshness rules as single-change dispatch
- **AND** missing or stale control-plane context stops the workflow instead of silently continuing with a guessed endpoint

#### Scenario: Shipped dispatch definitions remain synchronized
- **WHEN** the repository's Claude command and skill templates are validated
- **THEN** every ithyno definition that contacts the dashboard API is rejected if it embeds a `4321` endpoint fallback
- **AND** the development, Init-template, and packaged-extension copies remain byte-identical

#### Scenario: Global Claude definition shadows project definition
- **GIVEN** a project-local Claude ithyno command or skill and a user-global definition at the corresponding `~/.claude` path
- **WHEN** Manage Skills inspects the Claude installation
- **THEN** it reports a configuration conflict and identifies the global path that may shadow or stale-cache the project definition
- **AND** inspection and installation do not automatically delete or overwrite the global file
