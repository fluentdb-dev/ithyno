# Dashboard Specification

## Purpose
The project progress dashboard rendered from OpenSpec Markdown.

### Requirement: Progress Visualization
The system SHALL display a progress bar for each active change based on its tasks.md checklist.

#### Scenario: Partial completion
- GIVEN a change whose tasks.md has 2 of 5 tasks checked
- WHEN the overview is rendered
- THEN the change card SHALL show 40% progress
