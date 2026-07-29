## ADDED Requirements

### Requirement: Electron first launch shows welcome.html in the main window instead of a bare folder picker

The Electron shell SHALL load a static welcome page (`electron/welcome.html`) into the **same BrowserWindow** that will become the main app window when `ProjectStore.getLastProject()` does NOT return a valid directory. The welcome page replaces the current inline `pickProjectDialog()` fallback in the app's first-launch path; the native picker is still available but only fires when the user clicks `Open Folder…` inside the welcome page.

When `ProjectStore.getLastProject()` DOES return a valid directory, the shell SHALL skip the welcome page and open that project directly (unchanged behaviour — daily-driver users see zero friction and no visible flicker).

When the user picks a folder from the welcome view, the SAME BrowserWindow's URL SHALL swap to `localhost:<port>` in place via `mainWindow.loadURL(spawn.url)` — the BrowserWindow instance, its bounds, its preload, and its menu bar MUST persist across the swap. A second BrowserWindow MUST NOT be created for the transition.

Closing the window while it displays welcome.html (i.e. no project has been loaded) SHALL quit the app via the standard `window-all-closed` handler.

#### Scenario: First launch with no saved project loads welcome.html into the main window
- **GIVEN** the Electron app launches AND `ProjectStore.getLastProject()` returns `null`
- **WHEN** `app.whenReady()` fires
- **THEN** `createWindowForProject(null)` runs
- **AND** the main BrowserWindow is created and loads `welcome.html`
- **AND** the native folder picker does NOT open automatically
- **AND** no second BrowserWindow is created

#### Scenario: First launch with a stale saved project loads welcome.html
- **GIVEN** the Electron app launches AND `ProjectStore.getLastProject()` returns a path that is no longer a directory on disk
- **WHEN** `app.whenReady()` fires
- **THEN** the stale entry is removed via `ProjectStore.removeFromRecent`
- **AND** `createWindowForProject(null)` runs
- **AND** the main BrowserWindow loads `welcome.html`

#### Scenario: Launch with a valid saved project skips welcome.html
- **GIVEN** `ProjectStore.getLastProject()` returns a valid directory
- **WHEN** the app launches
- **THEN** the main window opens directly on `localhost:<port>` with that project
- **AND** welcome.html is NOT loaded

#### Scenario: Opening a folder from welcome swaps the URL in the same window
- **GIVEN** the main BrowserWindow currently displays welcome.html
- **WHEN** the user picks a folder via `Open Folder…` or clicks a valid Recent entry
- **THEN** `createWindowForProject(picked)` runs
- **AND** the server spawns for that project root
- **AND** the SAME `mainWindow` instance's URL swaps to `spawn.url` via `loadURL`
- **AND** the BrowserWindow instance identity is unchanged (no `.close()` on the welcome-loaded window)

#### Scenario: Closing the window on welcome.html quits the app
- **GIVEN** the main BrowserWindow displays welcome.html AND no project has been loaded
- **WHEN** the user closes the window
- **THEN** `window-all-closed` fires
- **AND** `app.quit()` is invoked

### Requirement: Welcome view shows app identity sourced from the same AboutConfig as the About panel

The welcome view (`welcome.html`) SHALL display, at minimum: the app icon (same `electron/build/icon.png` bundled for the dock/taskbar), the app name, the version string, and a license line. These values SHALL come from `readAboutConfig()` — the same function that populates `app.setAboutPanelOptions` for the native About panel. The welcome view MUST NOT hard-code any of these strings.

Value formatting SHALL follow the About-panel pattern of a muted label plus a raw value (e.g. `<span class="muted">Version</span> <code>0.0.1-alpha.0</code>`). String prefixes (e.g. `"v" + version`, `"License: " + license`) MUST NOT be used.

The welcome view MAY additionally display the app description and clickable footer links to the License and Repository URLs sourced from `aboutConfig.licenseUrl` / `aboutConfig.repositoryUrl`. External links SHALL open via `shell.openExternal` gated by an allowlist check (the URL MUST match one of the config-declared URLs — arbitrary URLs SHALL be refused).

The app icon MAY be delivered to welcome.html as an inline base64 data URL to sidestep `file://` / packaging-path resolution differences between dev and packaged layouts. The source file MUST be the same PNG the OS uses.

#### Scenario: Welcome shows the same identity as the About panel
- **GIVEN** the welcome view is loaded
- **WHEN** the user opens the About panel from the app menu
- **THEN** both surfaces show identical name, version, and license values
- **AND** both surfaces read from `readAboutConfig()`

#### Scenario: Values are rendered without string prefixes
- **GIVEN** the welcome view is loaded
- **THEN** the version is rendered as a bare value (e.g. `0.0.1-alpha.0`), NOT prefixed with `"v"`
- **AND** the license is rendered as a bare value (e.g. `GPL-3.0-or-later`), NOT prefixed with `"License: "`

#### Scenario: External link outside allowlist is refused
- **GIVEN** the welcome view's preload sends `welcome:open-external` with a URL that does NOT match `aboutConfig.licenseUrl` and does NOT start with `aboutConfig.repositoryUrl`
- **WHEN** the main-process handler runs
- **THEN** `shell.openExternal` is NOT invoked
- **AND** the request is logged (or silently dropped — implementation choice, but the URL MUST NOT open)

### Requirement: Welcome view offers a single "Open Folder" action and a Recent list

The welcome view's action area SHALL contain exactly one primary action: `Open Folder…`. Clicking it invokes `pickProjectDialog(mainWindow)`; on selection `createWindowForProject(picked)` runs on the same window (URL swap); on cancel the welcome view stays visible. This "Open Folder" action serves both existing OpenSpec folders and fresh folders — the post-selection `NoProjectDecisionPanel` decides whether to initialize or open normally.

The welcome view SHALL render a Recent projects list populated from `ProjectStore.getRecent()`. Each entry is clickable; clicking opens that project in the same window (URL swap). When a clicked recent path is no longer a directory on disk, the entry SHALL be removed via `ProjectStore.removeFromRecent`, the welcome view SHALL receive an updated recent list via `welcome:recent-updated`, and the welcome view SHALL stay visible.

The welcome view SHALL NOT include a separate `New Project…` button. The Open Folder path handles the new-project case via NoProjectDecisionPanel's Initialize action.

#### Scenario: Open Folder → native picker → URL swaps in place
- **GIVEN** the welcome view is loaded
- **WHEN** the user clicks `Open Folder…` AND selects a directory in the native picker
- **THEN** `createWindowForProject(path)` runs
- **AND** the SAME `mainWindow` instance's URL swaps to `spawn.url`

#### Scenario: Open Folder cancel keeps welcome visible
- **GIVEN** the welcome view is loaded
- **WHEN** the user clicks `Open Folder…` AND cancels the native picker
- **THEN** the welcome view remains visible
- **AND** no server is spawned

#### Scenario: Clicking a valid recent swaps URL to that project
- **GIVEN** the welcome view is loaded AND the Recent list shows a valid directory
- **WHEN** the user clicks that entry
- **THEN** `createWindowForProject(path)` runs
- **AND** the SAME `mainWindow` instance's URL swaps to `spawn.url`

#### Scenario: Clicking a stale recent removes it and keeps welcome visible
- **GIVEN** the welcome view is loaded AND the Recent list includes a path that no longer exists on disk
- **WHEN** the user clicks that entry
- **THEN** `ProjectStore.removeFromRecent(path)` is called
- **AND** the welcome view receives `welcome:recent-updated` with the pruned list
- **AND** the entry is no longer visible
- **AND** the welcome view stays loaded

### Requirement: Welcome IPC surface on the main preload

The welcome-view IPC surface SHALL be exposed on the SAME preload the main React app uses (`electron/src/preload.ts`), on the `window.ithynoWelcome` global. Because Electron pins a BrowserWindow's preload at construction time, and the same BrowserWindow is reused for both welcome.html and the main app URL, a single preload MUST serve both pages.

`window.ithynoWelcome` SHALL expose exactly:

- `getAbout(): Promise<AboutConfig & { iconDataUrl: string | null }>` — returns the same object as `readAboutConfig()` plus an inline icon data URL.
- `getRecent(): Promise<string[]>` — returns `ProjectStore.getRecent()`.
- `openFolder(): void` — routes to `pickProjectDialog()` + `createWindowForProject()` (main).
- `openRecent(path: string): void` — routes to the recent-open handler (main).
- `openExternal(url: string): void` — routes to the allowlisted external-open handler (main).
- `quit(): void` — routes to `app.quit()`.
- `onRecentUpdated(cb): () => void` — subscribes to main → renderer pushes on the `welcome:recent-updated` channel.

The main React app MUST NOT call any `ithynoWelcome` method (it has no need to). The welcome view MUST NOT call `openspecUI` or `ithyno` (its scope is limited to project selection).

The corresponding main-process IPC channels SHALL be exactly: `welcome:get-about`, `welcome:get-recent`, `welcome:open-folder`, `welcome:open-recent`, `welcome:open-external`, `welcome:quit`, and (main → renderer push) `welcome:recent-updated`.

#### Scenario: `ithynoWelcome` is available on both pages loaded into the main window
- **GIVEN** the main BrowserWindow was constructed with the main preload
- **WHEN** it loads welcome.html
- **THEN** `window.ithynoWelcome` is defined
- **WHEN** the URL swaps to `localhost:<port>`
- **THEN** `window.ithynoWelcome` is STILL defined (preload re-runs on every page load)
- **AND** the main React app simply does not use it

#### Scenario: IPC channel names are stable
- **GIVEN** the main-process registers the six welcome IPC channels
- **WHEN** the welcome preload issues an IPC call
- **THEN** the channel name MUST be one of `welcome:get-about`, `welcome:get-recent`, `welcome:open-folder`, `welcome:open-recent`, `welcome:open-external`, `welcome:quit`
- **AND** the main → renderer push channel MUST be `welcome:recent-updated`
