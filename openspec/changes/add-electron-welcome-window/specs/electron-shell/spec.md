## ADDED Requirements

### Requirement: Electron first launch opens a welcome window instead of a bare folder picker

The Electron shell SHALL open a dedicated welcome `BrowserWindow` on app launch when `ProjectStore.getLastProject()` does NOT return a valid directory. The welcome window replaces the current inline `pickProjectDialog()` fallback in the app's first-launch path; the native picker is still available but only fires when the user clicks `Open Folder…` inside the welcome window.

When `ProjectStore.getLastProject()` DOES return a valid directory, the shell SHALL skip the welcome window and open that project directly (unchanged behaviour — daily-driver users see zero friction).

Closing the welcome window without opening a project SHALL quit the app (`app.quit()`), matching the terminal semantics of the previous cancel-the-picker path but with clear user intent (they explicitly closed the welcome).

#### Scenario: First launch with no saved project shows the welcome window
- **GIVEN** the Electron app launches AND `ProjectStore.getLastProject()` returns `null`
- **WHEN** `app.whenReady()` fires
- **THEN** the welcome window opens
- **AND** the native folder picker does NOT open automatically

#### Scenario: First launch with a stale saved project shows the welcome window
- **GIVEN** the Electron app launches AND `ProjectStore.getLastProject()` returns a path that is no longer a directory on disk
- **WHEN** `app.whenReady()` fires
- **THEN** the stale entry is removed via `ProjectStore.removeFromRecent`
- **AND** the welcome window opens

#### Scenario: Launch with a valid saved project skips the welcome
- **GIVEN** `ProjectStore.getLastProject()` returns a valid directory
- **WHEN** the app launches
- **THEN** the main window opens directly with that project
- **AND** the welcome window is NOT shown

#### Scenario: Closing the welcome window quits the app
- **GIVEN** the welcome window is open AND no main project window has been created
- **WHEN** the user closes the welcome window
- **THEN** `app.quit()` is invoked

### Requirement: Welcome window shows app identity sourced from the same AboutConfig as the About panel

The welcome window SHALL display, at minimum: the app icon (same `electron/build/icon.png` bundled for the dock/taskbar), the app name, the version string, and a license line. These values SHALL come from `readAboutConfig()` — the same function that populates `app.setAboutPanelOptions` for the native About panel. The welcome window MUST NOT hard-code any of these strings.

The welcome window MAY additionally display the app description and clickable footer links to the License and Repository URLs sourced from `aboutConfig.licenseUrl` / `aboutConfig.repositoryUrl`. External links SHALL open via `shell.openExternal` gated by an allowlist check (the URL MUST match one of the config-declared URLs — arbitrary URLs SHALL be refused).

#### Scenario: Welcome shows the same identity as the About panel
- **GIVEN** the welcome window is open
- **WHEN** the user opens the About panel from the app menu
- **THEN** both surfaces show identical name, version, and license values
- **AND** both surfaces read from `readAboutConfig()`

#### Scenario: External link outside allowlist is refused
- **GIVEN** the welcome window preload sends `welcome:open-external` with a URL that does NOT match `aboutConfig.licenseUrl` and does NOT start with `aboutConfig.repositoryUrl`
- **WHEN** the main-process handler runs
- **THEN** `shell.openExternal` is NOT invoked
- **AND** the request is logged (or silently dropped — implementation choice, but the URL MUST NOT open)

### Requirement: Welcome window offers a single "Open Folder" action and a Recent list

The welcome window's action area SHALL contain exactly one primary button: `Open Folder…`. Clicking it invokes `pickProjectDialog(welcomeWindow)`; on selection the welcome window closes and the main project window opens; on cancel the welcome window stays open. This "Open Folder" action serves both existing OpenSpec folders and fresh folders — the post-selection `NoProjectDecisionPanel` decides whether to initialize or open normally.

The welcome window SHALL render a Recent projects list populated from `ProjectStore.getRecent()`. Each entry is clickable; clicking opens that project directly. When a clicked recent path is no longer a directory on disk, the entry SHALL be removed via `ProjectStore.removeFromRecent`, the welcome window SHALL receive an updated recent list via `welcome:recent-updated`, and the welcome window SHALL stay open (the user picks another action).

The welcome window SHALL NOT include a separate `New Project…` button. The Open Folder path handles the new-project case via NoProjectDecisionPanel's Initialize action.

#### Scenario: Open Folder → native picker → project opens
- **GIVEN** the welcome window is open
- **WHEN** the user clicks `Open Folder…` AND selects a directory in the native picker
- **THEN** `createWindowForProject(path)` runs
- **AND** the welcome window closes

#### Scenario: Open Folder cancel keeps welcome open
- **GIVEN** the welcome window is open
- **WHEN** the user clicks `Open Folder…` AND cancels the native picker
- **THEN** the welcome window remains open
- **AND** no main project window is created

#### Scenario: Clicking a valid recent opens it directly
- **GIVEN** the welcome window is open AND the Recent list shows a valid directory
- **WHEN** the user clicks that entry
- **THEN** `createWindowForProject(path)` runs
- **AND** the welcome window closes

#### Scenario: Clicking a stale recent removes it and keeps welcome open
- **GIVEN** the welcome window is open AND the Recent list includes a path that no longer exists on disk
- **WHEN** the user clicks that entry
- **THEN** `ProjectStore.removeFromRecent(path)` is called
- **AND** the welcome window receives `welcome:recent-updated` with the pruned list
- **AND** the entry is no longer visible
- **AND** the welcome window stays open

### Requirement: Welcome IPC surface

The welcome window's preload SHALL expose exactly the following API on `window.ithynoWelcome`:

- `getAbout(): Promise<AboutConfig>` — returns the same object as `readAboutConfig()`.
- `getRecent(): Promise<string[]>` — returns `ProjectStore.getRecent()`.
- `openFolder(): void` — routes to `pickProjectDialog()` (main).
- `openRecent(path: string): void` — routes to the recent-open handler (main).
- `openExternal(url: string): void` — routes to the allowlisted external-open handler (main).
- `quit(): void` — routes to `app.quit()`.

No other window (main project window, onboarding window) SHALL be given access to `window.ithynoWelcome`. Each preload script SHALL be scoped to its window.

The corresponding main-process IPC channels SHALL be exactly: `welcome:get-about`, `welcome:get-recent`, `welcome:open-folder`, `welcome:open-recent`, `welcome:open-external`, `welcome:quit`, and (main → renderer push) `welcome:recent-updated`.

#### Scenario: Welcome preload does not leak to other windows
- **GIVEN** the welcome window is closed and the main project window is open
- **WHEN** the main project window's renderer accesses `window.ithynoWelcome`
- **THEN** the property is `undefined` (each preload is scoped to its own BrowserWindow)

#### Scenario: IPC channel names are stable
- **GIVEN** the main-process registers the six welcome IPC channels
- **WHEN** the welcome preload issues an IPC call
- **THEN** the channel name MUST be one of `welcome:get-about`, `welcome:get-recent`, `welcome:open-folder`, `welcome:open-recent`, `welcome:open-external`, `welcome:quit`
- **AND** the main → renderer push channel MUST be `welcome:recent-updated`
