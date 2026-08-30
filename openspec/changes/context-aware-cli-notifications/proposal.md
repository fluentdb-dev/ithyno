## Why

The notification script currently assumes a single foreground application. That
causes clicks from Electron, VS Code, and direct CLI sessions to activate the
wrong application, and the behavior differs across operating systems.

## What Changes

- Pass execution context when a notification hook is installed.
- Select notification sender and click target for Electron, VS Code, and direct
  CLI contexts without hard-coding one host application.
- Define consistent macOS, Windows, and Linux fallback behavior.
- Keep project-aware notification grouping and timeout semantics across hosts.
- Make hook status and removal recognize context-aware hook commands.

## Capabilities

### New Capabilities
- `context-aware-cli-notifications`: Runtime-aware desktop notification behavior.

### Modified Capabilities
- `cli-notification-hooks`: Hook installation and click behavior carry execution context.

## Impact

- Notification script templates and per-CLI hook installers.
- Settings API/UI and runtime shell detection.
- Doctor/notification tests and documentation.
- No changes to agent execution or OpenSpec workflow semantics.
