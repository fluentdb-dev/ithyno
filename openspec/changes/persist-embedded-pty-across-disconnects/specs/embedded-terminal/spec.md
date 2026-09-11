## MODIFIED Requirements

### Requirement: PTY process cleanup on disconnect

The server SHALL keep the spawned PTY child process alive when its associated
`/pty` WebSocket closes temporarily, so a reconnect can reuse the same shell.
The server SHALL kill and reap the PTY only on explicit terminal restart,
project switch, server shutdown, PTY exit, or expiry of the disconnected idle
TTL.

#### Scenario: WebSocket disconnect does not kill PTY

- **GIVEN** a PTY child process is running for a project session
- **WHEN** its `/pty` WebSocket closes unexpectedly
- **THEN** the PTY child remains alive and the server retains the session entry

#### Scenario: Reconnect reuses PTY

- **GIVEN** a project session has a live PTY with no attached WebSocket
- **WHEN** a new `/pty` WebSocket connects with the same session identity
- **THEN** the server attaches it to the existing PTY without spawning a second process

#### Scenario: Explicit restart still cleans up

- **GIVEN** a PTY child process is running
- **WHEN** the user invokes terminal restart
- **THEN** the server kills and reaps the PTY, clears the session entry, and creates a fresh PTY

#### Scenario: Disconnected idle TTL cleans up

- **GIVEN** a PTY has no attached WebSocket for longer than the configured idle TTL
- **WHEN** the TTL expires
- **THEN** the server kills and reaps the PTY and removes its session entry

### Requirement: PTY session identity prevents duplicate processes

The server SHALL associate an embedded PTY with a stable project/session
identity and SHALL NOT spawn more than one live PTY for that identity.

#### Scenario: Concurrent reconnects

- **GIVEN** two clients connect for the same project/session identity
- **WHEN** both connection handlers run concurrently
- **THEN** exactly one PTY exists and the newest socket replaces the prior attachment
