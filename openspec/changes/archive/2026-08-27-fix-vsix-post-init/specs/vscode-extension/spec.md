## MODIFIED Requirements

### Requirement: Lazy Server Activation

The server process spawned on first `ithyno.show` SHALL receive a `PATH`
environment whose Windows user-level augmentation entries are appended using
the actual key name found in `process.env` (case-insensitive search for
`"path"`), so that no duplicate `Path`/`PATH` entry is created.

#### Scenario: Windows PATH key is title-case

- **GIVEN** `process.env` contains a key named `Path` (not `PATH`)
- **WHEN** `buildServerEnv()` augments the PATH
- **THEN** the augmentation is written to the `Path` key and no separate `PATH` key is created

### Requirement: Onboarding Webview Respects VS Code Theme

The onboarding iframe URL SHALL include `?vscode=1` so that `isVsCodeShell()`
returns `true` inside the React app and `useAppliedTheme()` subscribes to
`vscode:theme-changed` messages.

#### Scenario: Onboarding panel opens in VS Code

- **GIVEN** the extension opens the onboarding webview panel
- **WHEN** the iframe URL is constructed by `renderOnboardingHtml`
- **THEN** the URL contains `vscode=1` as a query parameter

## ADDED Requirements

### Requirement: Terminal Auto-Launch After Initialization

The extension SHALL auto-launch the VS Code terminal when the user clicks
"Open Project" after completing project initialization from the "No OpenSpec
project" decision panel, subject to the `ithyno.autoLaunchTerminal` setting
and the presence of `agents.yaml`, without disrupting the iframe's own
navigation back to the dashboard.

#### Scenario: Initialization completes in main webview, user clicks Open Project

- **GIVEN** the user opened a folder with no `agents.yaml`
- **AND** the ithyno dashboard is showing the "No OpenSpec project" panel
- **AND** the user clicked "Initialize openspec here" and completed initialization
- **WHEN** the user clicks "Open Project"
- **THEN** the extension receives `ithyno:init-complete` and auto-launches the terminal
- **AND** the iframe navigates to the initialized dashboard as before
