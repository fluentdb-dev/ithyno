## Worked

- BurnToast `New-BTContent -Launch -ActivationType Protocol` works exactly as
  designed — the pwsh process exits immediately and Windows handles the protocol
  activation independently when the toast is clicked.
- `vscode://file/<path>` correctly activates VS Code and opens the project folder.
- VS Code shows a security confirmation dialog on first use; checking "Allow
  opening local paths without asking" suppresses it for subsequent activations.

## Surprises

- BurnToast was not pre-installed on the dev machine. The script's silent
  try/catch meant no notification appeared at all (NotifyIcon fallback is
  effectively invisible on Windows 11). Installed via
  `Install-Module -Name BurntToast -Scope CurrentUser`.
- The `New-BurntToastNotification` high-level cmdlet does not expose
  `-ActivationType`. Had to use the lower-level content-builder pipeline
  (`New-BTText` → `New-BTBinding` → `New-BTVisual` → `New-BTContent` →
  `Submit-BTNotification`) as planned in the design.

## Differently

- Could add a user-facing message when BurnToast is not installed, suggesting
  `Install-Module BurntToast`. Currently it falls through silently to the
  NotifyIcon fallback which is nearly invisible on Windows 11.

## Follow-ups

- Consider adding BurnToast installation check to `runDoctor` / Prerequisites.
- The `ithyno://` protocol is registered by the Electron app; verify the
  handler opens the correct project folder on activation.
