## ADDED Requirements

### Requirement: Runtime Installation Detection

The system SHALL detect whether each declared runtime's `command` is
installed on the host machine at the time of query. Detection SHALL
use `which <cmd>` (or the platform equivalent) and report `{ installed:
true, path }` on exit-code-zero success or `{ installed: false, error
}` when the command cannot be found. Detection results MAY be cached
per-command within a single request pass, and multiple runtimes that
share a `command` SHALL be detected once and reuse the same result.

#### Scenario: installed command
- **GIVEN** a runtime with `command: echo` (universally available on POSIX)
- **WHEN** the runtime is detected
- **THEN** the result is `{ installed: true, path: "<absolute path>" }`

#### Scenario: missing command
- **GIVEN** a runtime with `command: this-command-does-not-exist-xyz`
- **WHEN** the runtime is detected
- **THEN** the result is `{ installed: false, error: "<message>" }`

#### Scenario: two runtimes share a command
- **GIVEN** two runtimes both with `command: bash`
- **WHEN** `detectAllRuntimes` is invoked
- **THEN** the underlying `which bash` is executed at most once and both entries carry the same result

#### Scenario: windows platform
- **GIVEN** the server is running on Windows
- **WHEN** any runtime is detected
- **THEN** the result is `{ installed: false, error: "windows detection not supported" }` for every runtime

### Requirement: Runtime Status Endpoint

The server SHALL expose `GET /api/agents/runtimes` — a local-only
endpoint that returns every declared runtime alongside its current
installation status. The response SHALL include, for each runtime,
`name`, `command`, `baseArgs`, `promptStyle`, optional `promptFlag`,
`supports`, `installed`, optional `path`, and optional `error`. The
endpoint SHALL support `?refresh=1` to force re-detection instead of
using any cached results.

#### Scenario: empty runtimes section
- **GIVEN** `agents.yaml` has no `runtimes:` section (or the section is empty)
- **WHEN** a client GETs `/api/agents/runtimes`
- **THEN** the response is `{ runtimes: [] }`

#### Scenario: mixed installed and missing runtimes
- **GIVEN** two runtimes `claude` (command `echo`) and `bogus` (command `this-does-not-exist-xyz`)
- **WHEN** a client GETs `/api/agents/runtimes`
- **THEN** the response contains `claude` with `installed: true` and `bogus` with `installed: false`

#### Scenario: non-local origin rejected
- **WHEN** a non-local address GETs the endpoint
- **THEN** the server responds 403

#### Scenario: refresh bypasses cache
- **GIVEN** a runtime that was previously reported as `installed: false`
- **AND** the user has since installed the command
- **WHEN** a client GETs `/api/agents/runtimes?refresh=1`
- **THEN** the server re-runs detection and reports the current state
