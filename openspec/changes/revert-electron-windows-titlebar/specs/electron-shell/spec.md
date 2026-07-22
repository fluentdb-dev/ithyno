## ADDED Requirements

### Requirement: Custom Window Chrome (macOS only)
On macOS, the Electron shell's BrowserWindow SHALL render without the
OS's default title bar and paint a Kanban-matched dark surface where
the bar would have been, via `titleBarStyle: 'hiddenInset'`, with the
traffic-light buttons remaining visible. The background color SHALL be
updatable at runtime via an IPC channel so it can track the
dashboard's active theme.

On Windows and Linux, the BrowserWindow SHALL use the OS's default
title bar and application menu (no `titleBarStyle` override) — these
platforms do NOT get a custom-painted title bar.

#### Scenario: macOS launches with hidden title bar
- **WHEN** the Electron app opens a project on macOS
- **THEN** the BrowserWindow is created with `titleBarStyle: 'hiddenInset'` and `backgroundColor: '#0f1115'`
- **AND** no OS title bar is drawn; traffic-light buttons float over the dark surface
- **AND** the renderer's header content reserves ~28px of top padding so no widget slides under the traffic lights

#### Scenario: Windows / Linux launches with the native frame
- **WHEN** the Electron app opens a project on Windows or Linux
- **THEN** the BrowserWindow is created without a `titleBarStyle` override
- **AND** the OS draws its standard title bar, window controls, and application menu bar (File / Edit / View / Window / Help)

#### Scenario: Theme change recolors the title bar on macOS
- **GIVEN** the dashboard's theme flips (Light ↔ Dark ↔ System)
- **WHEN** the renderer's applied-theme hook detects the flip
- **THEN** the renderer calls `window.openspecUI.setTitleBarColor(bg, symbol)` (a preload-bridged IPC)
- **AND** on macOS, the main process calls `window.setBackgroundColor(bg)` and the title bar area updates within one frame
- **AND** on Windows / Linux, the call is a no-op — the native frame does not support runtime recoloring and does not need it

#### Scenario: No white flash on launch
- **WHEN** the app cold-starts a project on any platform
- **THEN** the very first paint uses `backgroundColor: '#0f1115'` (or the last-persisted theme's background)
- **AND** no white/gray fallback is visible before the renderer's first paint

#### Scenario: CLI + browser is unaffected
- **WHEN** the dashboard is served from `bin/ithyno.js` and opened in a browser (not Electron)
- **THEN** none of the Electron-specific title-bar handling runs
- **AND** the renderer's Electron-runtime detection returns false
- **AND** no top-padding safe-area is applied

### Requirement: Windows / Linux Application Menu Reachable
The system SHALL keep the application menu (File → Open Project…,
Open Recent, New Project…, Close Project, Edit, View, Window, Help)
reachable via the OS-standard menu bar on Windows and Linux, since
those platforms use the native title bar (see Custom Window Chrome
above) rather than a renderer-drawn substitute.

#### Scenario: Menu bar visible and functional
- **WHEN** the Electron app runs on Windows or Linux
- **THEN** the native menu bar (File / Edit / View / Window / Help) is visible directly below the OS title bar
- **AND** all existing menu actions (Open Project…, Open Recent, New Project…, Reload Terminal, etc.) work exactly as before `add-electron-window-chrome`
