## ADDED Requirements

### Requirement: Terminal Delegated in VS Code Mode
The system SHALL skip mounting the embedded xterm.js terminal pane when the
dashboard runs inside a VS Code webview, because VS Code's own terminal
panel serves the same role and the editor's chrome already provides it.

#### Scenario: Standalone runtime
- **WHEN** the dashboard is loaded outside a VS Code webview (browser or Electron)
- **THEN** the embedded terminal pane is available and toggled via the existing controls

#### Scenario: VS Code runtime
- **WHEN** the dashboard is loaded inside a VS Code webview
- **THEN** the embedded terminal pane is not mounted, and visibility toggles related to it are suppressed
