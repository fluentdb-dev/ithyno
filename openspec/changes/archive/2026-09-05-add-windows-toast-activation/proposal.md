## Why

The macOS notification script already supports click-to-activate via `alerter`:
clicking a toast brings the host IDE (Electron, VS Code, Cursor, etc.) to the
foreground. The Windows `notify-waiting.ps1` shows a BurnToast notification
but clicking it does nothing — there is no activation callback. This makes
Windows notifications less useful than their macOS counterpart.

## What Changes

- Add `$HostAppName` parameter (3rd argument) to `notify-waiting.ps1`, matching
  the macOS script's `$3` (`notification_host_app`).
- Map `$HostAppName` and `$Context` to a protocol scheme (`vscode://`,
  `cursor://`, `windsurf://`, `ithyno://`).
- Use BurnToast's `New-BTContent -Launch "<proto>://file/<cwd>"
  -ActivationType Protocol` so clicking the toast activates the host IDE and
  navigates to the project folder.
- Read `cwd` from stdin JSON (`cwd` field) when available, falling back to
  `$env:ITHYNO_PROJECT_ROOT` then `$PWD` — matching the macOS script's
  project-name extraction.
- Add project-name extraction and notification grouping parity with the macOS
  script.
- NotifyIcon fallback path remains unchanged (no click-to-activate).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `cli-notification-hooks`: The Windows BurnToast path now supports
  click-to-activate via Protocol Activation, and accepts a `$HostAppName`
  parameter to select the target IDE.

## Impact

- `templates/scripts/notify-waiting.ps1` — primary change target.
- No changes to `bin/init.js` — `notificationCommand` already passes
  `hostAppName` as the 4th arg when present.
- No server or API changes.
- All target protocols (`vscode://`, `cursor://`, `windsurf://`, `ithyno://`)
  are confirmed registered on the host machine.
