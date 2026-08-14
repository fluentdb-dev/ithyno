# Outcome: fix-tmux-startup-windows

## What worked

- PowerShell-native `tmux new-session -e VAR=$env:VAR` is the simplest possible fix: no bash, no temp files, no extra imports.
- `usePlatform()` helper in tests cleanly gates platform-dependent describe blocks, keeping existing tmux tests green on the Windows host.

## What surprised us

- Three prior approaches failed before landing on this: (1) `bash -c` wrapper rejected by PowerShell parser, (2) Git Bash as PTY shell caused ConPTY/MSYS2 incompatibility (`AttachConsole failed`), (3) temp `.sh` file + `& "bash.exe"` did not display as a terminal in the Electron PTY pane.
- The root cause was simpler than all three approaches: PowerShell already has the env vars (set by `buildManagerPtyEnv`), so just passing them via `-e` to psmux is sufficient.

## What we'd do differently

- Ask "what does the PTY shell already have in its env?" before designing env-passing logic. The answer (`buildManagerPtyEnv` sets them all) would have led directly to the `-e $env:VAR` approach.

## Follow-ups

- `update-environment` refresh for existing psmux sessions on Windows is still deferred. The `-e` flags cover the new-session creation case, which is the common path.
