## 1. Update notify-waiting.ps1

- [x] 1.1 Add `$HostAppName` parameter (3rd positional arg, default empty string)
- [x] 1.2 Read `cwd` from stdin JSON (via `ConvertFrom-Json`) when stdin is not a terminal, fallback to `$env:ITHYNO_PROJECT_ROOT` then `$PWD`
- [x] 1.3 Extract `$projectName` from `$cwd` (last path segment)
- [x] 1.4 Add protocol-scheme mapping: `switch ($HostAppName)` for VS Code / Cursor / Windsurf / Antigravity; electron context maps to `ithyno`
- [x] 1.5 When `$proto` is non-empty and BurnToast is available, use `New-BTContent -Launch "$proto://file/$cwd" -ActivationType Protocol` + `Submit-BTNotification`
- [x] 1.6 When `$proto` is empty or BurnToast unavailable, preserve current behavior (simple `New-BurntToastNotification` or NotifyIcon fallback)
- [x] 1.7 Add notification grouping via `-UniqueIdentifier` matching macOS `--group "ithyno:$cli_name:$project_id"` pattern

## 2. Verify

- [x] 2.1 `npm run typecheck` passes
- [x] 2.2 `npm test` passes (1 unrelated flaky test: detached-runner EBUSY)
- [x] 2.3 Manual test: run `notify-waiting.ps1` with `$HostAppName = "Visual Studio Code"` — toast shown, pending click verification
