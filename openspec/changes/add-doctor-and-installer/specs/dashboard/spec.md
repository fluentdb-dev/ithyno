## ADDED Requirements

### Requirement: Doctor endpoint enumerates prerequisites

The server SHALL expose `GET /api/doctor` that returns a snapshot of every prerequisite ithyno depends on (agent CLIs, tmux, agmsg) with per-item install status, version, and resolved path. The endpoint SHALL also declare `readyForManager: boolean` (true when at least one agent CLI is installed).

#### Scenario: Doctor endpoint returns a report

- **WHEN** an authorized client sends `GET /api/doctor`
- **THEN** the response is a JSON object with keys `agents` (per-CLI map), `tmux`, `agmsg`, `readyForManager`, `checkedAt`
- **AND** each per-CLI entry has `{ installed, version?, path?, error? }`
- **AND** `readyForManager` is `true` iff at least one agent CLI has `installed === true`

#### Scenario: Doctor endpoint requires session token

- **WHEN** the request lacks a valid session token
- **THEN** the response is 401 (per existing auth middleware)

### Requirement: Doctor installer endpoint installs optional prerequisites

The server SHALL expose `POST /api/doctor/install` that accepts `{ tool: "tmux" | "agmsg" }` and invokes the appropriate installer, streaming progress via SSE. Anything else SHALL be rejected with 400. Agent CLIs SHALL NOT be auto-installable through this endpoint.

#### Scenario: Install tmux on macOS

- **GIVEN** the request body is `{ tool: "tmux" }` and the host is macOS with `brew` on PATH
- **WHEN** the client sends `POST /api/doctor/install`
- **THEN** the endpoint spawns `brew install tmux` and streams its stdout as SSE `event: progress` lines
- **AND** on subprocess exit, emits `event: done` with `{ ok: boolean, exitCode: number }` and closes the stream
- **AND** on the successful path, broadcasts a `doctor-updated` WS event so the dashboard refetches

#### Scenario: Reject unsupported install target

- **WHEN** the body is `{ tool: "claude" }` or any string other than `tmux` / `agmsg`
- **THEN** the response is 400 with a message naming which tools ARE installable

#### Scenario: Reject on unsupported platform

- **GIVEN** the host has no known package manager for tmux (neither `brew`, `apt-get`, `dnf`, nor `pacman` resolves)
- **WHEN** the client sends `POST /api/doctor/install { tool: "tmux" }`
- **THEN** the response is 400 with a message pointing at the tmux docs

### Requirement: `ithyno doctor` CLI subcommand

The ithyno CLI SHALL expose a `doctor` subcommand that runs the same doctor check as `/api/doctor` and prints a human-readable table to stdout. It SHALL exit 0 when `readyForManager === true`, exit 1 otherwise, and accept a `--json` flag to emit the raw `DoctorReport`.

#### Scenario: Human-readable report

- **WHEN** the user runs `ithyno doctor` in a shell
- **THEN** the output is a plain-text table with per-tool status, version, and path
- **AND** the final line reads `ready for Manager: yes` or `... : no`

#### Scenario: JSON output for scripting

- **WHEN** the user runs `ithyno doctor --json`
- **THEN** stdout is a single JSON document matching `DoctorReport`
- **AND** exit code follows the same yes/no rule

### Requirement: Settings page Prerequisites section

The dashboard Settings page SHALL render a "Prerequisites" section listing every prerequisite with status + version + [Install] action for the installable ones. The section SHALL refresh automatically when a `doctor-updated` WS event arrives.

#### Scenario: Prerequisites render

- **WHEN** the user opens Settings
- **THEN** a "Prerequisites" section appears above Appearance
- **AND** every agent CLI, tmux, and agmsg is listed with a green check or red x
- **AND** tmux and agmsg get an [Install] button when their status is red

#### Scenario: Install button spawns a live-progress modal

- **WHEN** the user clicks [Install] for tmux
- **THEN** a modal opens showing streamed installer output
- **AND** on completion the doctor state refetches and the section refreshes without a full reload
