# vscode-extension Specification

## Purpose
TBD - created by archiving change add-vscode-extension. Update Purpose after archive.
## Requirements
### Requirement: Show Dashboard Command
The system SHALL register a VS Code command `openspecUI.show` ("OpenSpec UI:
Show Dashboard") that opens the dashboard inside the editor as a webview
panel, using the active workspace folder as the OpenSpec project root.

#### Scenario: Command opens the dashboard
- **WHEN** the user invokes `openspecUI.show` with at least one workspace folder open
- **THEN** the extension spawns the Fastify server with `OPENSPEC_PROJECT_ROOT` set to the workspace folder and opens a webview panel pointing at it

#### Scenario: No folder open
- **WHEN** the user invokes `openspecUI.show` with no workspace folder open
- **THEN** the extension shows a message asking the user to open a folder first and does not start the server

#### Scenario: Multi-root workspace
- **WHEN** the user invokes `openspecUI.show` in a multi-root workspace
- **THEN** the extension uses the first workspace folder as the project root (multi-root selection is future work)

### Requirement: Lazy Server Activation
The system SHALL NOT start the dashboard server on extension activation; the
server SHALL start only when the user first invokes `openspecUI.show`.

#### Scenario: Activation is cheap
- **WHEN** the extension activates (e.g. VS Code launches with it installed)
- **THEN** no server process is spawned and no port is bound

#### Scenario: First show triggers spawn
- **WHEN** the user invokes `openspecUI.show` for the first time in the session
- **THEN** the extension picks a free port, spawns the server, and waits for `/api/health` to succeed before opening the webview

### Requirement: Server Lifecycle Bound to Extension
The system SHALL terminate the spawned server when the extension deactivates
or the dashboard panel is disposed, so background processes do not outlive
their UI.

#### Scenario: Panel close terminates server
- **WHEN** the user closes the dashboard panel
- **THEN** the extension sends `SIGTERM` to the spawned server and the panel disposes

#### Scenario: Extension deactivate terminates server
- **WHEN** VS Code deactivates the extension (window close, extension disable)
- **THEN** any spawned server processes are terminated

### Requirement: VSIX Build Path
The system SHALL provide a documented npm script that produces a `.vsix`
package consumable via "Install from VSIX..." in VS Code.

#### Scenario: Build the VSIX
- **WHEN** the developer runs the documented packaging script in `vscode-extension/`
- **THEN** the build emits a `.vsix` file that can be installed locally

