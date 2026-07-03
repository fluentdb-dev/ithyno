# embedded-terminal Specification

## Purpose
TBD - created by archiving change add-ui-orchestration. Update Purpose after archive.
## Requirements
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

### Requirement: Session Persists Across Navigation
The system SHALL keep the PTY session alive when the user navigates between
dashboard pages, so an in-flight conversation or process is not lost by
visiting another change or the specs page.

#### Scenario: Navigate away and back
- **WHEN** the user runs a command in the terminal and then navigates to a different change or the Specs page
- **THEN** the PTY session continues running and the terminal pane shows the same shell, scrollback, and any output produced during navigation

### Requirement: Session Persists Across Hide/Show
The system SHALL keep the PTY session alive when the user toggles the terminal
pane's visibility, so hiding the pane never destroys the shell.

#### Scenario: Hide and show
- **WHEN** the user hides the terminal pane and then shows it again
- **THEN** the same PTY session is visible, including any output that arrived while hidden

### Requirement: Terminal Available on All Routes
The system SHALL render the terminal pane on every dashboard route when the
pane is visible, not just on the change detail page.

#### Scenario: Terminal visible on Overview
- **WHEN** the terminal is visible and the user navigates to the Overview page
- **THEN** the terminal pane remains shown, docked alongside the page content

### Requirement: Embedded Terminal Pane
The system SHALL provide a terminal pane in the dashboard backed by a real
pseudo-terminal on the local server, with its working directory set to the
OpenSpec project root, so the user can run Claude Code and other commands beside
the kanban.

#### Scenario: Run a command in the project
- **WHEN** the user types a command in the terminal pane
- **THEN** it executes in a PTY whose cwd is the OpenSpec project root and output streams back to the pane

#### Scenario: Terminal edit updates the kanban live
- **WHEN** Claude Code in the terminal checks a task in tasks.md
- **THEN** the watcher detects the change and the kanban on the same screen updates without a manual refresh

### Requirement: Cross-platform Shell Selection
The system SHALL choose an appropriate default shell per operating system and
SHALL allow the launch command to be configured.

#### Scenario: Windows default shell
- **WHEN** the server runs on Windows
- **THEN** it launches pwsh.exe when available, otherwise powershell.exe

#### Scenario: POSIX default shell
- **WHEN** the server runs on macOS or Linux
- **THEN** it launches the user's $SHELL, falling back to /bin/bash

### Requirement: Graceful Degradation Without a PTY
The system SHALL run without the terminal when a PTY backend is unavailable, and
SHALL report the terminal's availability.

#### Scenario: PTY backend missing
- **WHEN** the native PTY module cannot be loaded
- **THEN** the dashboard starts normally, reports the terminal as unavailable, and hides the terminal pane

### Requirement: Local-only Terminal Access
The system SHALL restrict the terminal connection to local clients, because the
PTY exposes a real shell.

#### Scenario: Non-local connection refused
- **WHEN** a non-localhost client attempts to open the terminal socket
- **THEN** the system refuses the connection

### Requirement: Terminal Delegated in VS Code Mode
The system SHALL skip mounting the embedded xterm.js terminal pane when the
dashboard runs inside a VS Code webview, because VS Code's own terminal
panel serves the same role and the editor's chrome already provides it.

#### Scenario: Standalone runtime
- **WHEN** the dashboard is loaded outside a VS Code webview (browser or Electron)
- **THEN** the embedded terminal pane is available and toggled via the existing controls

#### Scenario: VS Code runtime
- **WHEN** the dashboard is loaded inside a VS Code webview
- **THEN** the embedded terminal pane is not mounted, and visibility toggles related to it are suppressed

