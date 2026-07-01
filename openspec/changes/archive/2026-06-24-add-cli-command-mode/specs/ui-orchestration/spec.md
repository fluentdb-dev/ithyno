## ADDED Requirements

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
