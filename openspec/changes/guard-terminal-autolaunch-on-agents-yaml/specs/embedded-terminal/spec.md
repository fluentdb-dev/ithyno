## ADDED Requirements

### Requirement: Terminal view is gated on agents.yaml presence

The embedded terminal (the whole `<aside class="global-terminal">` pane on the web/Electron shell, plus the VS Code extension's terminal-panel auto-open) SHALL check for `<project-root>/agents.yaml` before rendering or opening. When `agents.yaml` is absent, the terminal view SHALL be suppressed entirely — no aside pane, no hidden-state anchor, no PTY WebSocket, and no VS Code terminal panel — regardless of user configuration.

The rationale: absent `agents.yaml`, there is no dispatch runtime to drive; a terminal without agent orchestration is out of scope for ithyno. Users who want a plain shell can still open one in their host terminal.

#### Scenario: No agents.yaml — terminal view hidden on web/Electron

- **GIVEN** a project whose root does NOT contain `agents.yaml`
- **WHEN** the user opens that project in the ithyno dashboard (browser or Electron shell)
- **THEN** the `<aside class="global-terminal">` pane is NOT rendered
- **AND** the `<div class="terminal-hidden-anchor">` restore button is NOT rendered
- **AND** no `/pty` WebSocket connection is opened by the dashboard
- **AND** the server does NOT spawn a PTY for that project
- **AND** the server logs `[pty] auto-launch skipped — no agents.yaml at <project-root>` for observability

#### Scenario: No agents.yaml — VS Code extension does not open terminal

- **GIVEN** a project without `agents.yaml` opened in VS Code with the ithyno extension active
- **AND** the user's `ithyno.autoLaunchTerminal` setting is `true` (the default)
- **WHEN** the extension activates for that workspace
- **THEN** the extension does NOT open the ithyno terminal panel automatically
- **AND** subsequent explicit user commands (opening the dashboard, invoking `ithyno: New Project`, etc.) still work as before

#### Scenario: agents.yaml present — behavior unchanged

- **GIVEN** a project whose root contains `agents.yaml`
- **WHEN** the user opens that project
- **THEN** the terminal aside renders and the auto-launch fires as before this requirement
- **AND** the Manager Claude Code process starts per the existing per-project session-id logic

#### Scenario: User is nudged to add agents.yaml

- **GIVEN** a project whose root does NOT contain `agents.yaml`
- **WHEN** the user opens the Settings page
- **THEN** an unobtrusive `.info-banner` renders explaining that terminal auto-launch is off and pointing at `agents.yaml` as the enabler
