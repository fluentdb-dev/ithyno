# csrf-protection Specification

## Purpose
TBD - created by archiving change add-csrf-protection. Update Purpose after archive.
## Requirements
### Requirement: Per-process Session Token
The system SHALL use a cryptographically random 32-byte session token for authentication. A standalone server SHALL generate the token at startup. A shell-managed server MAY receive a valid token from its launcher and SHALL then use that token for the complete dashboard session instead of replacing it during same-session recovery. The launch URL printed to the user SHALL contain the active token so the web UI has a same-origin path to receive it.

#### Scenario: Standalone server generates token
- **WHEN** the server starts without a launcher-provided session token
- **THEN** it generates a 32-byte token and prints a launch URL containing `?token=<token>` to stdout

#### Scenario: Launcher-provided token is reused
- **WHEN** a shell-managed server starts with the valid token owned by an existing dashboard session
- **THEN** it uses that exact token and prints it in the launch URL

#### Scenario: Invalid launcher token is rejected
- **WHEN** a shell-managed server is given a token that is not exactly 64 hexadecimal characters
- **THEN** startup fails without weakening authentication or silently substituting the invalid value

#### Scenario: Auto-open uses the token URL
- **WHEN** the CLI opens the dashboard with `OPENSPEC_OPEN=1`
- **THEN** the URL it opens contains `?token=<token>`

#### Scenario: Renderer recovery keeps token
- **WHEN** the Electron renderer reloads or recovers authentication inside an active dashboard session
- **THEN** the session token remains unchanged and previously launched Manager processes remain authorized

#### Scenario: New dashboard session gets new token
- **WHEN** the application starts a new dashboard session after application launch or project switch
- **THEN** a new random token is generated and tokens from the prior dashboard session stop working

### Requirement: Mutating Endpoints Require Token
The system SHALL require the session token on every mutating HTTP endpoint
(POST, PATCH, PUT, DELETE), via either an `X-Session-Token` header or a
`?token=` query parameter, and SHALL reject requests that lack a valid one.

#### Scenario: Valid token accepted
- **WHEN** the UI calls `POST /api/pty/inject` with `X-Session-Token: <valid>`
- **THEN** the request proceeds

#### Scenario: Missing token rejected
- **WHEN** a mutating request arrives without a token
- **THEN** the server responds 401 with `{ error: "auth required" }` and does not perform the action

#### Scenario: Wrong token rejected
- **WHEN** a mutating request arrives with a token that does not match the current process's
- **THEN** the server responds 403 with `{ error: "auth invalid" }` and does not perform the action

### Requirement: Origin Allow-list on Mutating Endpoints
The system SHALL enforce an Origin allow-list on every mutating endpoint,
admitting only the server's own origin variants and the VS Code webview
scheme, so cross-origin browser fetches are blocked even if they somehow
obtain a token.

#### Scenario: Same-origin Origin accepted
- **WHEN** a mutating request carries Origin `http://localhost:<port>` matching the server
- **THEN** the request proceeds

#### Scenario: VS Code webview Origin accepted
- **WHEN** a mutating request carries an Origin starting with `vscode-webview://`
- **THEN** the request proceeds

#### Scenario: Cross-origin Origin rejected
- **WHEN** a mutating request carries an Origin not on the allow-list
- **THEN** the server responds 403 with `{ error: "origin not allowed" }`

#### Scenario: Absent Origin admitted when token is valid
- **WHEN** a mutating request omits Origin (e.g. a CLI script) and carries a valid token
- **THEN** the request proceeds (browsers cannot omit Origin from cross-origin fetches)

### Requirement: Content-type Enforcement on Mutating Endpoints
The system SHALL require `Content-Type: application/json` on mutating
endpoints that carry a body, so that browser CSRF attempts using simple
content types (`text/plain`, `application/x-www-form-urlencoded`,
`multipart/form-data`) are forced into a preflight that the Origin check
rejects.

#### Scenario: Wrong content-type rejected
- **WHEN** a `POST /api/tasks/toggle` arrives with `Content-Type: text/plain`
- **THEN** the server responds 415 with `{ error: "content-type must be application/json" }`

#### Scenario: Correct content-type accepted
- **WHEN** the same request carries `Content-Type: application/json`
- **THEN** it proceeds through the remaining checks

### Requirement: WebSocket Upgrade Token Check
The system SHALL require the session token on `/ws` and `/pty` WebSocket
upgrades via a `?token=` query parameter and SHALL refuse the upgrade
otherwise.

#### Scenario: Valid token upgrade
- **WHEN** a client requests `/ws?token=<valid>` and the Origin is on the allow-list (or absent)
- **THEN** the WebSocket upgrade succeeds

#### Scenario: Missing or invalid token upgrade
- **WHEN** the upgrade lacks `?token=` or the token does not match
- **THEN** the server destroys the socket without completing the upgrade

### Requirement: GET Endpoints Remain Unauthenticated
The system SHALL leave read-only GET endpoints unauthenticated, so the
webview iframe and bootstrap reads work without per-request gating, while
all mutating actions remain protected.

#### Scenario: Unauthenticated state read
- **WHEN** a GET to `/api/state`, `/api/docs`, `/api/tags`, `/api/changes/:id`, or `/api/health` arrives
- **THEN** it succeeds regardless of token or Origin

