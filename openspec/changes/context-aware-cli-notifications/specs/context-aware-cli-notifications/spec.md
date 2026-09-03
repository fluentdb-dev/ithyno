## ADDED Requirements

### Requirement: Hook installation records execution context
The Settings hook installer SHALL record whether the hook was enabled from the
Electron shell, VS Code extension, or direct CLI context.

#### Scenario: Electron context
- **WHEN** a user enables a hook from Electron
- **THEN** the generated hook invokes the notification script with Electron as its context

#### Scenario: VS Code context
- **WHEN** a user enables a hook from the VS Code extension
- **THEN** the generated hook invokes the notification script with VS Code as its context

### Requirement: Context-aware click behavior
The notification script SHALL activate only the recorded host application on
click and SHALL perform no application launch when context is `cli` or unknown.

#### Scenario: Direct CLI notification
- **WHEN** a direct CLI hook notification is clicked
- **THEN** no unrelated application or project folder is opened

#### Scenario: Electron notification
- **WHEN** an Electron-context notification is clicked
- **THEN** the ithyno application is activated

### Requirement: Cross-platform provider behavior
The script SHALL select the native provider for the host OS and preserve
project-aware grouping without requiring a fixed sender application.

#### Scenario: Separate projects
- **WHEN** the same CLI emits notifications for two projects
- **THEN** their notification groups are distinct

#### Scenario: Unsupported click actions
- **WHEN** the host provider does not support click actions
- **THEN** the notification is shown and the CLI continues normally
