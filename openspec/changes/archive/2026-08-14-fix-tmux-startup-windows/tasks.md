## 1. Implementation

- [x] 1.1 Add Windows branch in `ptyStartup()` that generates PowerShell-native `tmux new-session` startup with `-e VAR=$env:VAR` flags
- [x] 1.2 Add `usePlatform()` test helper and apply `usePlatform('linux')` to existing tmux describe blocks so they pass on Windows host
- [x] 1.3 Add Windows-specific describe block verifying `$env:VAR` syntax in startup and absence of POSIX syntax
