# Capability: UI Layout & Dialogs

## MODIFIED Requirements

### Requirement: Settings Page Responsive Container
The Settings page SHALL restrict its maximum container width and center itself horizontally within the main viewport on wide displays, matching the responsive layout structure of other main dashboard tabs.

#### Scenario: Settings page has restricted width on wide viewports
- **GIVEN** the screen resolution has a wide viewport (e.g. 1920px wide)
- **WHEN** the user navigates to the Settings page
- **THEN** the main container is restricted to a maximum width (e.g. 900px)
- **AND** it is horizontally centered within the viewport

### Requirement: Modal Dialog Scroll Overflow
All modal dialogs, including AGMSG configuration and prerequisite installation modals, SHALL enforce a maximum height (`max-height: 85vh`) and enable vertical scrolling (`overflow-y: auto`) for content overflow, ensuring all modal actions, form fields, and buttons remain fully visible and accessible.

#### Scenario: Modals are scrollable on small viewports
- **GIVEN** the viewport height is small (e.g. 400px high)
- **WHEN** the user opens a modal dialog (such as the AGMSG configuration or prerequisite installation modal)
- **THEN** the modal's maximum height is capped relative to the viewport height
- **AND** the modal contents become vertically scrollable
- **AND** all action buttons and form fields remain accessible

