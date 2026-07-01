## ADDED Requirements

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
