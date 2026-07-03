## ADDED Requirements

### Requirement: Task Filtering
The system SHALL provide a control in the Change Detail Tasks view to show only
incomplete tasks, and SHALL remember the choice per change across reloads.

#### Scenario: Hide completed tasks
- **WHEN** the user enables "show incomplete only"
- **THEN** checked tasks and sections with no remaining tasks are hidden

#### Scenario: Filter persists per change
- **WHEN** the user enabled the filter on a change and reloads the dashboard
- **THEN** that change's Tasks view opens with the filter still enabled
