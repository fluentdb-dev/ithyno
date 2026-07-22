## ADDED Requirements

### Requirement: Auto-launch is gated on agents.yaml presence

The embedded terminal's auto-launch (both the PTY-injected startup command on the web/Electron shells AND the VS Code extension's `autoLaunchTerminal` setting) SHALL check for `<project-root>/agents.yaml` before firing. When `agents.yaml` is absent, the auto-launch SHALL be suppressed regardless of user configuration.

#### Scenario: No agents.yaml — auto-launch suppressed on web/Electron

- **GIVEN** a project whose root does NOT contain `agents.yaml`
- **WHEN** the user opens that project in the ithyno dashboard (browser or Electron shell)
- **THEN** the embedded terminal's PTY spawns a plain shell (bash / zsh) as before
- **AND** the previously-injected Claude startup command (`claude --resume <session-id>` or the configured alternative) is NOT auto-sent
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
- **THEN** the auto-launch fires as before this requirement
- **AND** the Manager Claude Code process starts per the existing per-project session-id logic

#### Scenario: Manual terminal open remains available

- **GIVEN** a project without `agents.yaml` in the dashboard
- **WHEN** the user manually invokes the terminal (via the size toggle from `add-terminal-size-toggle`, or any other explicit affordance)
- **THEN** the PTY is created and a plain shell prompt appears
- **AND** the user can start Claude Code manually if they wish (`claude` from the shell) — auto-launch's absence does not block manual use
