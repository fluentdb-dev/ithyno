## ADDED Requirements

### Requirement: Dashboard exposes a Development Environment workspace
The dashboard SHALL expose a top-level Development Environment route that is
visually and conceptually separate from ithyno Settings and agent configuration.
It SHALL provide profile selection, variable metadata, explicit reveal/edit
actions, diagnostics, save review, and process restart state.

#### Scenario: User opens the Environment route
- **WHEN** the user selects Environment from the top navigation
- **THEN** the dashboard shows project env profiles and the selected profile's masked variable table

#### Scenario: No env files exist
- **WHEN** the project contains no supported `.env*` file
- **THEN** the screen explains how to create the first profile without treating ithyno session variables as project variables

### Requirement: Environment UI survives ordinary dashboard focus and route changes
Unsaved environment edits SHALL remain available during ordinary focus changes
and navigation within the same dashboard session, and SHALL require explicit
discard or successful save before being cleared.

#### Scenario: Window loses focus
- **WHEN** the user has unsaved variable edits and switches to another application
- **THEN** the draft remains intact when the dashboard regains focus
