## ADDED Requirements

### Requirement: Manager PTY cwd is re-targetable at runtime via HTTP

The server SHALL expose `POST /api/project/switch` that updates its notion of the current project root and terminates all live embedded PTYs, so the next `/pty` WebSocket connection spawns its PTY at the new project root. The server SHALL NOT require a process restart to switch projects at runtime.

#### Scenario: Runtime project switch terminates live PTYs and re-targets

- **GIVEN** ithyno is running with the current project root at `/path/A` and one or more Manager PTYs are attached
- **WHEN** a client sends `POST /api/project/switch` with `{ projectRoot: "/path/B" }` and the path is valid + authorized
- **THEN** the server updates its internal project root to `/path/B`
- **AND** it terminates every live PTY (each PTY process is killed and each attached WebSocket is closed with code 1000 and reason "project switch")
- **AND** it broadcasts `state-replaced` so connected dashboards refetch state
- **AND** the endpoint returns 200 with `{ projectRoot: "/path/B" }`

#### Scenario: Reconnect after switch spawns PTY at new cwd

- **GIVEN** a project switch just completed from `/path/A` to `/path/B`
- **WHEN** the client re-opens the `/pty` WebSocket
- **THEN** the server spawns the new PTY with cwd = `/path/B`
- **AND** running `pwd` in that PTY reports `/path/B`

#### Scenario: `/opsx:propose` after switch lands in the correct project

- **GIVEN** ithyno launched with cwd = `/path/A`, then switched to `/path/B`, then the client reconnected the PTY
- **WHEN** the user invokes `/opsx:propose <id>` in the reconnected Manager PTY
- **THEN** the change scaffold is created at `/path/B/openspec/changes/<id>/`, not `/path/A/`

#### Scenario: Concurrent switch is guarded

- **WHEN** a `POST /api/project/switch` request is in-flight
- **AND** a second `POST /api/project/switch` request arrives before the first completes
- **THEN** the second request returns 409 with a message about a switch already in progress
- **AND** the first request completes normally

#### Scenario: Unauthorized project path is rejected

- **WHEN** a client sends `POST /api/project/switch` with `projectRoot: "/etc"` (or any path under the system-path blocklist)
- **THEN** the endpoint returns 403 with the reason
- **AND** the server's project root is NOT changed
- **AND** no PTYs are terminated

#### Scenario: Nonexistent or non-directory path is rejected

- **WHEN** a client sends `POST /api/project/switch` with a path that does not exist or is not a directory
- **THEN** the endpoint returns 400 with a clear reason
- **AND** the server's project root is NOT changed
- **AND** no PTYs are terminated
