## MODIFIED Requirements

### Requirement: Electron first launch shows welcome.html in the main window instead of a bare folder picker

The Electron shell SHALL load a static welcome page (`electron/welcome.html`) into the **same BrowserWindow** that will become the main app window when `ProjectStore.getLastProject()` does NOT return a valid directory.

When `ProjectStore.getLastProject()` DOES return a valid directory, the shell SHALL also show `welcome.html` as an **immediate placeholder** in the BrowserWindow while the server is starting. Once the server is ready, the window SHALL navigate from `welcome.html` to the server URL in-place — the same same-window swap used when the user picks a folder from the welcome view. The BrowserWindow instance, its bounds, its preload, and its menu bar MUST persist across the swap.

In both cases, the BrowserWindow SHALL be created and made visible before `spawnServer()` completes, so the user sees a window immediately rather than a blank screen during server startup.

#### Scenario: First launch with no saved project loads welcome.html into the main window
- **GIVEN** the Electron app launches AND `ProjectStore.getLastProject()` returns `null`
- **WHEN** `app.whenReady()` fires
- **THEN** the main BrowserWindow is created and loads `welcome.html`
- **AND** the native folder picker does NOT open automatically
- **AND** no second BrowserWindow is created

#### Scenario: Saved project — window appears before server is ready
- **GIVEN** the Electron app launches AND `ProjectStore.getLastProject()` returns a valid directory
- **WHEN** `app.whenReady()` fires
- **THEN** the main BrowserWindow is created and shows `welcome.html` immediately
- **AND** `spawnServer()` runs while the window is already visible
- **AND** once the server is ready, the window navigates to the server URL in-place
- **AND** no second BrowserWindow is created

## ADDED Requirements

### Requirement: Startup phase timing logs

The Electron shell SHALL emit `[startup] <phase>: <ms>ms` log lines to the main-process stdout for each phase of `spawnServer` (pickFreePort, spawn, token, pollHealth) and `createWindowForProject` (spawnServer total, new BrowserWindow, loadURL, ready-to-show) so that startup bottlenecks can be measured on any platform without attaching a profiler.

#### Scenario: Startup logs emitted
- **WHEN** the Electron app launches and opens a project
- **THEN** the main-process stdout contains `[startup]`-prefixed lines for each phase with millisecond durations
