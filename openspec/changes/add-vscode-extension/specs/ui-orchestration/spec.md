## ADDED Requirements

### Requirement: Inject Routes Through VS Code in Webview Mode
The system SHALL route the `injectPty` action to the host VS Code extension
when running inside a webview, posting a message that the extension forwards
to a managed VS Code terminal via `terminal.sendText`. In all other runtimes
the existing `POST /api/pty/inject` HTTP path is used.

#### Scenario: Standalone runtime injects via HTTP
- **WHEN** the user clicks Apply, Archive, Merge, Discard, or "+ New Change" outside a VS Code webview
- **THEN** the dashboard sends `POST /api/pty/inject` and the embedded terminal carries the command

#### Scenario: VS Code runtime injects via postMessage
- **WHEN** the user clicks Apply, Archive, Merge, Discard, or "+ New Change" inside a VS Code webview
- **THEN** the dashboard posts a `pty.inject` message to the extension host, which calls `terminal.sendText` on a managed VS Code Terminal named "OpenSpec UI"

#### Scenario: Managed terminal lifecycle
- **WHEN** the extension receives its first inject message in a session
- **THEN** it creates the "OpenSpec UI" terminal with `cwd` set to the workspace folder; subsequent injects reuse the same terminal

#### Scenario: Terminal shown automatically
- **WHEN** the extension forwards an inject
- **THEN** it calls `terminal.show()` so the user sees the typed command in the VS Code terminal panel
