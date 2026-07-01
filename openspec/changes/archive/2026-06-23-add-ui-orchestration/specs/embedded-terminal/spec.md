## ADDED Requirements

### Requirement: Programmatic Input Injection
The system SHALL accept programmatic input from local HTTP clients and write it
to the active embedded terminal session, so dashboard controls can trigger
commands without typing.

#### Scenario: Inject a command line
- **WHEN** a local POST to /api/pty/inject arrives with text and terminate=true
- **THEN** the system writes the text followed by a newline to the most recently active /pty socket and returns 200

#### Scenario: Inject without terminating newline
- **WHEN** a local POST to /api/pty/inject arrives with terminate=false
- **THEN** the system writes the text verbatim and does NOT append a newline

#### Scenario: No active terminal
- **WHEN** a POST to /api/pty/inject arrives but no /pty socket is open
- **THEN** the system returns 409 with a reason and does not write anywhere

#### Scenario: Non-local client refused
- **WHEN** a non-localhost client sends POST /api/pty/inject
- **THEN** the system rejects the request with 403
