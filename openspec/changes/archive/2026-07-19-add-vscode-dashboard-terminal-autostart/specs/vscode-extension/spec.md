# vscode-extension — deltas from add-vscode-dashboard-terminal-autostart

## ADDED Requirements

### Requirement: Dashboard Terminal Auto-launch

The VS Code extension SHALL contribute a boolean configuration
`ithyno.autoLaunchTerminal` (default `true`) that controls WHEN
the "ithyno" VS Code Terminal is created after the dashboard
opens.

When `ithyno.autoLaunchTerminal` is `true`, opening a fresh
dashboard panel via `ithyno.show` SHALL immediately create the
terminal, send the resolved startup command (per
`ithyno.terminalStartup` semantics), and reveal the terminal with
`preserveFocus: true` so keyboard focus remains on the dashboard.

When `ithyno.autoLaunchTerminal` is `false`, the terminal MUST NOT
be created until the first `pty.inject` message arrives from the
webview (the pre-existing lazy behavior).

Revealing an already-open dashboard via `panel.reveal` MUST NOT
create a second terminal regardless of the config value — the
existing terminal is reused.

If the user manually closes the terminal, the extension MUST
re-create it on the next trigger (button press OR next
`ithyno.show` invocation, depending on the config).

#### Scenario: Fresh panel with default config

- **Given** `ithyno.autoLaunchTerminal` unset or `true` AND no
  existing dashboard panel
- **When** the user runs `ithyno: Show Dashboard`
- **Then** the extension MUST create the "ithyno" VS Code Terminal
  before returning
- **And** the terminal MUST run the resolved startup command
  (`claude --session-id <uuid>` for a fresh project, `claude
  --resume <uuid>` for an existing session, or the
  `ithyno.terminalStartup` override)
- **And** the dashboard webview MUST retain keyboard focus

#### Scenario: Fresh panel with config disabled

- **Given** `ithyno.autoLaunchTerminal` is `false` AND no
  existing dashboard panel
- **When** the user runs `ithyno: Show Dashboard`
- **Then** no VS Code Terminal SHALL be created
- **And** when the webview later posts a `pty.inject` message, the
  terminal SHALL be created at that point using the same startup
  resolution logic

#### Scenario: Re-revealing an existing panel

- **Given** an existing dashboard session with a live terminal
- **When** the user runs `ithyno: Show Dashboard` a second time
- **Then** the panel is revealed via `panel.reveal`
- **And** no second terminal SHALL be created
- **And** the existing terminal MUST NOT receive a second startup
  command

#### Scenario: User closes the terminal, then triggers a button

- **Given** an existing dashboard, `autoLaunchTerminal: true`, and
  the user has closed the "ithyno" terminal
- **When** the webview posts a `pty.inject` message
- **Then** a fresh terminal MUST be created
- **And** it MUST run the startup command (subject to the
  session-id contract — same UUID as before, so `claude --resume
  <uuid>`)

#### Scenario: User closes the terminal, then closes+reopens the dashboard

- **Given** the user has closed both the "ithyno" terminal AND the
  dashboard panel, `autoLaunchTerminal: true`
- **When** the user runs `ithyno: Show Dashboard`
- **Then** a fresh panel is created (not revealed)
- **And** a fresh terminal is created eagerly
- **And** it runs `claude --resume <uuid>` (same UUID from
  `.ithyno/session-id`)
