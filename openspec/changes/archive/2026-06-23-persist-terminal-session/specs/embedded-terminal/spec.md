## ADDED Requirements

### Requirement: Session Persists Across Navigation
The system SHALL keep the PTY session alive when the user navigates between
dashboard pages, so an in-flight conversation or process is not lost by
visiting another change or the specs page.

#### Scenario: Navigate away and back
- **WHEN** the user runs a command in the terminal and then navigates to a different change or the Specs page
- **THEN** the PTY session continues running and the terminal pane shows the same shell, scrollback, and any output produced during navigation

### Requirement: Session Persists Across Hide/Show
The system SHALL keep the PTY session alive when the user toggles the terminal
pane's visibility, so hiding the pane never destroys the shell.

#### Scenario: Hide and show
- **WHEN** the user hides the terminal pane and then shows it again
- **THEN** the same PTY session is visible, including any output that arrived while hidden

### Requirement: Terminal Available on All Routes
The system SHALL render the terminal pane on every dashboard route when the
pane is visible, not just on the change detail page.

#### Scenario: Terminal visible on Overview
- **WHEN** the terminal is visible and the user navigates to the Overview page
- **THEN** the terminal pane remains shown, docked alongside the page content
