# electron-shell Specification

## Purpose
TBD - created by archiving change add-electron-shell. Update Purpose after archive.
## Requirements
### Requirement: Project Picker on First Launch
The system SHALL prompt the user to select a project folder the first time
the Electron app starts (no persisted project), and SHALL quit cleanly when
the user cancels the dialog.

#### Scenario: First launch with no state
- **WHEN** the user starts the app and no `state.json` exists
- **THEN** the app shows an "Open Project" folder dialog before doing anything else

#### Scenario: Cancel from the picker
- **WHEN** the user cancels the first-launch picker
- **THEN** the app quits cleanly without starting a server or opening a window

### Requirement: Last Project Restore
The system SHALL restore the last opened project on subsequent launches
without re-prompting, falling back to the picker when the saved path no
longer exists.

#### Scenario: Saved project still exists
- **WHEN** the saved last project path resolves to an existing directory
- **THEN** the app spawns the server for that project and opens the window directly

#### Scenario: Saved project missing
- **WHEN** the saved last project path no longer exists on disk
- **THEN** the app falls back to the first-launch picker behavior

### Requirement: Open Project Menu
The system SHALL provide a "File → Open Project…" menu item that switches
the active project by tearing down the existing server and spawning a fresh
one for the chosen folder.

#### Scenario: Switch project
- **WHEN** the user picks a different folder via "File → Open Project…"
- **THEN** the existing server child is SIGTERM'd, a new server is spawned for the new folder, and the window navigates to the new launch URL

### Requirement: Recent Projects
The system SHALL keep an MRU list of up to ten recent projects in
`state.json` and expose them as a "File → Open Recent" submenu.

#### Scenario: Recent submenu populated
- **WHEN** the user has opened at least one project
- **THEN** "File → Open Recent" lists every project from most recent to oldest, capped at ten

#### Scenario: Click a recent entry
- **WHEN** the user clicks a recent-project entry
- **THEN** the app switches to it via the same teardown path as "Open Project…"

### Requirement: Server Spawn with Token URL
The system SHALL spawn `bin/openspec-ui.js` as a child process with
`OPENSPEC_PROJECT_ROOT` set to the chosen folder, a free TCP port, and
`OPENSPEC_OPEN=0`; SHALL parse the launch URL (including the session token)
from the server's stdout; and SHALL load that URL into the BrowserWindow
only after `GET /api/health` succeeds.

#### Scenario: Server reaches health
- **WHEN** the server spawn succeeds and `/api/health` returns 200 within the timeout
- **THEN** the BrowserWindow loads the launch URL extracted from stdout

#### Scenario: Server fails to start
- **WHEN** the health check times out
- **THEN** the app shows an error dialog with the stderr tail and offers to retry or quit

### Requirement: Single Instance Lock
The system SHALL allow at most one running instance of the Electron app at a
time; a second launch focuses the existing window instead of spawning a
parallel server.

#### Scenario: Second launch
- **WHEN** a second instance is started while one is already running
- **THEN** the second exits immediately and the first is focused

#### Scenario: Second launch with a folder argument
- **WHEN** the second instance carries a folder path argument and the first is running
- **THEN** the first instance switches to that folder via the same teardown path as "Open Project…"

### Requirement: Window State Persistence
The system SHALL persist window size and position across launches and SHALL
fall back to defaults when the saved position is no longer on a connected
display.

#### Scenario: Restore previous size and position
- **WHEN** the app launches with a valid saved window state
- **THEN** the window opens at the same size and position

#### Scenario: Off-screen position
- **WHEN** the saved position is no longer on any connected display
- **THEN** the window opens at the default 1400×900 centered

### Requirement: Clean Server Termination on Quit
The system SHALL SIGTERM the spawned server when the app quits and SHALL
allow up to two seconds for graceful exit before forcing termination.

#### Scenario: Quit with graceful exit
- **WHEN** the user quits and the server exits within two seconds of SIGTERM
- **THEN** the app exits cleanly

#### Scenario: Quit with hung server
- **WHEN** the server does not exit within two seconds
- **THEN** the app sends SIGKILL and exits

### Requirement: Packaging
The system SHALL provide an `electron-builder` configuration that produces
DMG (macOS), NSIS installer (Windows), and AppImage (Linux) artifacts from
the same source.

#### Scenario: Build a packaged artifact
- **WHEN** the developer runs the documented packaging script for any supported platform
- **THEN** the build emits the corresponding installer / disk image

