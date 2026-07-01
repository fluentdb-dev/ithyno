## ADDED Requirements

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
