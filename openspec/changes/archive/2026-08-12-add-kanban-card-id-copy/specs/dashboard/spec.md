## ADDED Requirements

### Requirement: Copy Change ID from Kanban Card

Every Kanban card SHALL provide a copy control that writes the card's exact
change ID to the system clipboard. The control SHALL reuse the CLI command
copy interaction and SHALL not activate the card's Change Detail navigation.

#### Scenario: User copies a change ID
- **GIVEN** a Kanban card for change `add-search`
- **WHEN** the user activates the card's copy control
- **THEN** the clipboard receives exactly `add-search`
- **AND** the control temporarily displays the shared copied-state indicator
- **AND** the current route does not change

#### Scenario: Clipboard permission is unavailable
- **WHEN** writing the change ID to the clipboard fails
- **THEN** the dashboard displays the same clipboard-permission error toast used by the CLI command copy control

#### Scenario: Copy control is accessible
- **WHEN** assistive technology inspects the card copy control
- **THEN** the control identifies that it copies the card's change ID
- **AND** the full ID is available in its tooltip
