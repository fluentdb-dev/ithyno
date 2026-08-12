## MODIFIED Requirements

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
