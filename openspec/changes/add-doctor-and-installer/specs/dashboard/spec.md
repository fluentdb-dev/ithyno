## ADDED Requirements

### Requirement: Doctor endpoint enumerates prerequisites

The server SHALL expose `GET /api/doctor` that returns a snapshot of every prerequisite ithyno depends on (agent CLIs, tmux, agmsg) with per-item install status, version, and resolved path. The endpoint SHALL also declare `readyForManager: boolean` (true when at least one agent CLI is installed).

On Windows, the report SHALL additionally include a `gitBash: CliStatus`-shaped field distinguishing a real Git Bash installation from the platform's WSL launcher stubs (`C:\Windows\System32\bash.exe`, the WindowsApps execution-alias `bash.exe`) — both of which satisfy a bare `command -v bash` check without being Git Bash, and silently launching WSL instead of Git Bash breaks the agmsg/tmux integration `add-windows-agmsg-support` built. On macOS/Linux this field is omitted (no equivalent ambiguity). The `agmsg` status SHALL also fail (with an explanatory `error`) on Windows when Git Bash cannot be resolved or `sqlite3` is not on `PATH`, even when the `~/.agents/skills/agmsg/scripts/send.sh` marker file is present — a prior file copy succeeding does not mean agmsg can actually run.

#### Scenario: Doctor endpoint returns a report

- **WHEN** an authorized client sends `GET /api/doctor`
- **THEN** the response is a JSON object with keys `agents` (per-CLI map), `tmux`, `agmsg`, `readyForManager`, `checkedAt`
- **AND** each per-CLI entry has `{ installed, version?, path?, error? }`
- **AND** `readyForManager` is `true` iff at least one agent CLI has `installed === true`

#### Scenario: Doctor endpoint requires session token

- **WHEN** the request lacks a valid session token
- **THEN** the response is 401 (per existing auth middleware)

#### Scenario: Windows report distinguishes Git Bash from a WSL stub

- **GIVEN** the server runs on Windows (`process.platform === "win32"`)
- **WHEN** an authorized client sends `GET /api/doctor`
- **THEN** the response includes `gitBash: { installed: true, path: "<...>\\bin\\bash.exe" }` when a real Git Bash install is found via `git --exec-path`'s reported root
- **AND** `gitBash: { installed: false, error: "..." }` when only a WSL launcher stub resolves (or `git` itself isn't found)

#### Scenario: Windows agmsg status reflects runtime readiness, not just file presence

- **GIVEN** the server runs on Windows
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` exists (a prior copy succeeded)
- **AND** `sqlite3` is NOT on `PATH`
- **WHEN** an authorized client sends `GET /api/doctor`
- **THEN** `agmsg.installed` is `false` with an `error` naming the missing dependency, despite the marker file existing

### Requirement: Doctor installer endpoint installs optional prerequisites

The server SHALL expose `POST /api/doctor/install` that accepts `{ tool: "tmux" | "agmsg" }` and invokes the appropriate installer, streaming progress via SSE. Anything else SHALL be rejected with 400. Agent CLIs SHALL NOT be auto-installable through this endpoint.

On Windows, `tool: "tmux"` has no automated install path (no package manager reliably installs a working tmux fork) — the endpoint SHALL stream download + PATH-setup guidance instead of installing anything, and SHALL NOT return 400 for this case (the request is valid; there is simply no automation to perform). `tool: "agmsg"` on Windows SHALL verify Git Bash and `sqlite3` are resolvable BEFORE copying the vendored tree — copying files that cannot run is worse than not copying, since the doctor report would then show a false-positive `installed: true` for the marker file alone.

#### Scenario: Install tmux on macOS

- **GIVEN** the request body is `{ tool: "tmux" }` and the host is macOS with `brew` on PATH
- **WHEN** the client sends `POST /api/doctor/install`
- **THEN** the endpoint spawns `brew install tmux` and streams its stdout as SSE `event: progress` lines
- **AND** on subprocess exit, emits `event: done` with `{ ok: boolean, exitCode: number }` and closes the stream
- **AND** on the successful path, broadcasts a `doctor-updated` WS event so the dashboard refetches

#### Scenario: Reject unsupported install target

- **WHEN** the body is `{ tool: "claude" }` or any string other than `tmux` / `agmsg`
- **THEN** the response is 400 with a message naming which tools ARE installable

#### Scenario: Reject on unsupported platform (macOS/Linux with no known package manager)

- **GIVEN** the host is macOS or Linux with no known package manager for tmux (neither `brew`, `apt-get`, `dnf`, nor `pacman` resolves)
- **WHEN** the client sends `POST /api/doctor/install { tool: "tmux" }`
- **THEN** the response is 400 with a message pointing at the tmux docs

#### Scenario: tmux install on Windows streams download guidance instead of installing

- **GIVEN** the request body is `{ tool: "tmux" }` and the host is Windows
- **WHEN** the client sends `POST /api/doctor/install`
- **THEN** the endpoint streams SSE `event: progress` lines with a download link for a Windows tmux fork (psmux) and instructions to add the extracted folder to `PATH`
- **AND** emits `event: done` with `{ ok: false }` (no automated install performed) and closes the stream
- **AND** does NOT respond 400 — the request itself is valid, there is just no automation for this platform

#### Scenario: agmsg install on Windows gates on Git Bash + sqlite3 before copying

- **GIVEN** the request body is `{ tool: "agmsg" }`, the host is Windows, and `~/.agents/skills/agmsg/scripts/send.sh` does not yet exist
- **AND** either Git Bash cannot be resolved or `sqlite3` is not on `PATH`
- **WHEN** the client sends `POST /api/doctor/install`
- **THEN** the endpoint streams an SSE `event: progress` line naming the missing dependency
- **AND** emits `event: done` with `{ ok: false }` WITHOUT copying `vendor/agmsg` to `~/.agents/skills/agmsg`

#### Scenario: agmsg install on Windows proceeds when both dependencies resolve

- **GIVEN** the request body is `{ tool: "agmsg" }`, the host is Windows, Git Bash resolves, and `sqlite3` is on `PATH`
- **WHEN** the client sends `POST /api/doctor/install`
- **THEN** the endpoint proceeds with the same `cpSync` copy + chmod behavior already specified for other platforms

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

#### Scenario: Windows agmsg row explains a Git Bash gap

- **GIVEN** the dashboard runs on Windows and `doctor.gitBash.installed === false`
- **WHEN** the user views the Prerequisites section
- **THEN** the agmsg row's red x is accompanied by the `gitBash.error` hint text, rather than an unexplained failure
