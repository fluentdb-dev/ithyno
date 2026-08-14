---
id: fix-tmux-startup-windows
---

## Context

On Windows, the embedded terminal PTY shell is PowerShell (`pwsh.exe`).
`ptyStartup()` generates a startup string that is written as typed input into
the PTY after 300 ms. The existing startup string uses POSIX syntax that
PowerShell cannot parse.

psmux (a Windows-native tmux port, `~/.local/bin/tmux.exe`) is already on
PowerShell's `PATH`. PowerShell expands `$env:VAR` at command evaluation time,
so env vars can be passed to psmux via `-e VAR=$env:VAR` without any POSIX
syntax or bash intermediary.

## Goals

- Pass `ITHYNO_PORT`, `ITHYNO_BASE`, `ITHYNO_SESSION_TOKEN` to psmux sessions
  on Windows.
- Keep PowerShell as the PTY shell (ConPTY is incompatible with MSYS2
  bash.exe).
- Zero impact on non-Windows platforms.

## Non-Goals

- `update-environment` refresh for existing tmux sessions on Windows (deferred;
  `-e` flags cover the initial session creation case).

## Decisions

### PowerShell-native startup string

Generate `tmux new-session -A -s <session> -e ITHYNO_PORT=$env:ITHYNO_PORT
-e ITHYNO_BASE=$env:ITHYNO_BASE -e ITHYNO_SESSION_TOKEN=$env:ITHYNO_SESSION_TOKEN
-- <command>` when `process.platform === 'win32'`. PowerShell expands
`$env:VAR` before passing arguments to psmux.

### Approaches rejected

1. `bash -c '...'` in PowerShell — PowerShell rejects single-quoted `-c` arg.
2. Git Bash as PTY shell (`shellOverride`) — ConPTY incompatible with MSYS2
   bash.exe (`AttachConsole failed`, DISCONNECT).
3. Temp `.sh` file + `& "bash.exe" "file.sh"` — did not display as a terminal
   in the actual Electron PTY pane.

## Risks

- psmux behavior with `-e` flags on session reattach (`-A`) may differ from
  creation; the `-e` values are set at creation only.
