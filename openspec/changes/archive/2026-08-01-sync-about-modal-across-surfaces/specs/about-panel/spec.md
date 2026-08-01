# Purpose

Synchronize About modal behavior across Electron app menu items and header topbar `?` icon.

## MODIFIED Requirements

### Requirement: Electron About panel and Help menu items

The Electron shell SHALL wire `app.setAboutPanelOptions` to full `AboutInfo` metadata (applicationName, applicationVersion, version, copyright, website, comments, authors) AND dispatch `ithyno:open-about` IPC event to open the rich `AboutModal` in the main window on About menu item click.

#### Scenario: Native About panel is populated

- **GIVEN** the Electron app has finished starting up (`app.whenReady()` resolved)
- **WHEN** the user triggers the About panel
- **THEN** `app.setAboutPanelOptions` is populated with `applicationName`, `applicationVersion`, `version`, `copyright`, `website`, `comments`, and `authors` derived from `AboutInfo`

#### Scenario: About menu item opens in-app AboutModal

- **GIVEN** the Electron app menu or Help menu is open
- **WHEN** the user clicks "About ithyno"
- **THEN** `ithyno:open-about` IPC event is sent to the main window
- **AND** the main window renders the rich `AboutModal` containing the exact same full metadata and actions as the topbar `?` button

#### Scenario: Help menu items open external URLs

- **GIVEN** the Electron Help menu is open
- **WHEN** the user clicks any sponsor entry, "Check for Updates…", "Report an Issue", or "View License"
- **THEN** the system default browser opens the corresponding URL via `shell.openExternal`
