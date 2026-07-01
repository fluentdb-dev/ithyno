# Delta for Dashboard

## ADDED Requirements
### Requirement: Theme Toggle
The system SHALL provide a control to switch between light and dark themes,
persisting the choice across sessions.

#### Scenario: Toggle persists
- GIVEN a user who selected dark mode
- WHEN the user reloads the dashboard
- THEN the dashboard SHALL render in dark mode

## MODIFIED Requirements
### Requirement: Progress Visualization
The system SHALL display a progress bar for each active change, using
theme-aware colors so it remains legible in both light and dark modes.
