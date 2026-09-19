## ADDED Requirements

### Requirement: Onboarding Webview Respects VS Code Theme

The system SHALL forward the active VS Code theme (`"light"` or `"dark"`) to
the onboarding iframe on load and on every subsequent theme change. The parent
webview document MUST respond to `vscode:get-theme` messages from the iframe
by calling `sendTheme()`, which posts `{ type: "vscode:theme-changed", theme }`
back into the iframe.

#### Scenario: Onboarding opens in dark VS Code theme

- **GIVEN** VS Code is using a dark theme (`vscode-dark` class on body)
- **WHEN** the `ithyno.newProject` onboarding webview opens
- **THEN** the React app inside the iframe receives `vscode:theme-changed` with `theme: "dark"`
- **AND** `document.documentElement.dataset.theme` is set to `"dark"`

#### Scenario: VS Code theme changes while onboarding is open

- **GIVEN** the onboarding webview is open
- **WHEN** the VS Code theme changes (body class changes)
- **THEN** the MutationObserver fires `sendTheme()` and the iframe receives the updated theme
