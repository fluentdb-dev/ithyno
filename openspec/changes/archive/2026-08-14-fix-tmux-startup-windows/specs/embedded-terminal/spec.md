## ADDED Requirements

### Requirement: Tmux Wrap Uses PowerShell Syntax on Windows

The system SHALL, on Windows (`process.platform === 'win32'`) with tmux
enabled and found on PATH, generate a startup string using PowerShell-native
syntax: `tmux new-session -A -s <session> -e ITHYNO_PORT=$env:ITHYNO_PORT
-e ITHYNO_BASE=$env:ITHYNO_BASE -e ITHYNO_SESSION_TOKEN=$env:ITHYNO_SESSION_TOKEN
-- <command>`. PowerShell expands `$env:VAR` at evaluation time so the actual
values reach psmux without any POSIX shell or bash intermediary.

#### Scenario: Windows with tmux enabled

- **GIVEN** `process.platform === 'win32'`
- **AND** tmux is enabled and found on PATH
- **WHEN** `ptyStartup` is called
- **THEN** the returned startup string uses PowerShell `$env:VAR` syntax for env var passing
- **AND** the startup string contains no POSIX syntax (`2>/dev/null`, `exec tmux`, `grep -qw`)

#### Scenario: Non-Windows platform (unchanged)

- **GIVEN** the platform is not Windows
- **AND** tmux is enabled and found on PATH
- **WHEN** `ptyStartup` is called
- **THEN** the returned startup string is the POSIX tmux session wrap, unchanged from existing behavior
