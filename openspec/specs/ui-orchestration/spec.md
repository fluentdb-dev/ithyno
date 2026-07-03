# ui-orchestration Specification

## Purpose
TBD - created by archiving change add-ui-orchestration. Update Purpose after archive.
## Requirements
### Requirement: Dashboard-initiated OpenSpec Workflow
The system SHALL provide dashboard controls that initiate the OpenSpec workflow
(`/opsx:propose`, `/opsx:apply`, `/opsx:archive`) by sending the corresponding
slash command to the active embedded terminal, where Claude Code executes it.

#### Scenario: Propose a new change from Overview
- **WHEN** the user clicks "+ New Change" on the Overview, enters a description, and confirms
- **THEN** the system injects `/opsx:propose "<description>"` followed by Enter into the active terminal

#### Scenario: Apply a change from its detail page
- **WHEN** the user clicks "Apply" on a change's header and confirms
- **THEN** the system injects `/opsx:apply <change-id>` followed by Enter into the active terminal

#### Scenario: Archive a change from its detail page
- **WHEN** the user clicks "Archive" on a change's header and confirms
- **THEN** the system injects `/opsx:archive <change-id>` followed by Enter into the active terminal

### Requirement: Preview Before Sending
The system SHALL show the exact command that will be injected before the user
confirms, so no command runs without explicit acknowledgement.

#### Scenario: Confirm dialog shows the command
- **WHEN** the user opens any workflow action
- **THEN** the dialog shows the literal `/opsx:*` line that will be sent

### Requirement: No Active Terminal Handling
The system SHALL detect when no embedded terminal is open and SHALL prompt the
user to open one rather than silently failing.

#### Scenario: No terminal available
- **WHEN** the user triggers a workflow action with no open /pty socket
- **THEN** the system shows a message asking them to open a change view (which spawns the terminal) and does not write anywhere

### Requirement: Command Style Selection
The system SHALL let the user choose between two command styles for every
UI-initiated workflow action — `claude` (slash commands for Claude Code in the
terminal) and `cli` (the raw OpenSpec CLI via `npx openspec`) — and SHALL
persist the chosen default across sessions.

#### Scenario: Default mode on first use
- **WHEN** the user opens the dashboard for the first time
- **THEN** the command style is `claude` and `/opsx:*` commands are used

#### Scenario: Switching mode in a modal updates the default
- **WHEN** the user changes the mode in a command modal and sends the action
- **THEN** subsequent modals open with the newly chosen mode as their default

#### Scenario: Mode persists across reloads
- **WHEN** the user chose `cli` and reloads the dashboard
- **THEN** modals open in `cli` mode

### Requirement: Active Mode Visible on Action Buttons
The system SHALL display the active command style on each workflow action
button, so the user can see which style will be invoked before opening a modal.

#### Scenario: CLI mode badge
- **WHEN** the command style is `cli`
- **THEN** the New Change, Apply, and Archive buttons display a "CLI" badge

#### Scenario: Claude mode badge
- **WHEN** the command style is `claude`
- **THEN** the buttons display a "Claude" badge

### Requirement: OpenSpec CLI Command Mapping
The system SHALL inject CLI-form commands when the command style is `cli`.

#### Scenario: New Change in CLI mode
- **WHEN** the user submits the New Change modal in `cli` mode with a kebab-case id
- **THEN** the system injects `npx openspec new change <id>` followed by Enter

#### Scenario: Archive in CLI mode
- **WHEN** the user confirms Archive in `cli` mode for a change `<id>`
- **THEN** the system injects `npx openspec archive <id>` followed by Enter

### Requirement: New Change Modal Adapts to Mode
The system SHALL ask for a description in `claude` mode and a kebab-case id in
`cli` mode, because the two commands accept different inputs.

#### Scenario: Claude mode asks for description
- **WHEN** the user opens New Change in `claude` mode
- **THEN** the modal presents a description input and previews `/opsx:propose "<description>"`

#### Scenario: CLI mode asks for id
- **WHEN** the user opens New Change in `cli` mode
- **THEN** the modal presents a kebab-case id input and previews `npx openspec new change <id>`

#### Scenario: CLI id validation
- **WHEN** the user enters an invalid id (uppercase, spaces, or empty) in CLI mode
- **THEN** the Send button is disabled until a valid kebab-case id is provided

### Requirement: Apply Requires Claude Mode
The system SHALL disable the Apply action in `cli` mode and SHALL display an
explanation that Apply requires Claude Code in the terminal, because there is
no single-command CLI equivalent for implementing tasks.

#### Scenario: Apply disabled in CLI mode
- **WHEN** the command style is `cli`
- **THEN** the Apply button is disabled and shows a tooltip noting it requires Claude Code

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

