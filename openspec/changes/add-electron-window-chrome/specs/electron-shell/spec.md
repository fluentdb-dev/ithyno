## MODIFIED Requirements

### Requirement: Custom Window Chrome
The Electron shell's BrowserWindow SHALL render without the OS's
default title bar and paint a Kanban-matched dark surface where the
bar would have been. On macOS the traffic-light buttons SHALL remain
visible via `titleBarStyle: 'hiddenInset'`; on Windows and Linux a
custom `titleBarOverlay` SHALL provide the same visual with native
window control buttons drawn against the specified color. The color
SHALL be updatable at runtime via an IPC channel so it can track
the dashboard's active theme (see `add-light-dark-mode`).

#### Scenario: macOS launches with hidden title bar
- **WHEN** the Electron app opens a project on macOS
- **THEN** the BrowserWindow is created with `titleBarStyle: 'hiddenInset'` and `backgroundColor: '#0f1115'`
- **AND** no OS title bar is drawn; traffic-light buttons float over the dark surface
- **AND** the renderer's header content reserves ~28px of top padding so no widget slides under the traffic lights

#### Scenario: Windows / Linux launches with custom overlay
- **WHEN** the Electron app opens on Windows or Linux
- **THEN** the BrowserWindow is created with `titleBarStyle: 'hidden'` and `titleBarOverlay: { color: '#0f1115', symbolColor: '#e6e9ef', height: 32 }`
- **AND** the OS draws its window controls over the specified color
- **AND** no legacy OS title-bar strip is visible above the overlay

#### Scenario: Theme change recolors the title bar
- **GIVEN** the dashboard's theme flips (Light ↔ Dark ↔ System, via `add-light-dark-mode`)
- **WHEN** the renderer's applied-theme hook detects the flip
- **THEN** the renderer calls `window.openspecUI.setTitleBarColor(bg, symbol)` (a preload-bridged IPC)
- **AND** the main process, on macOS, calls `window.setBackgroundColor(bg)`
- **AND** on Windows / Linux, calls `window.setTitleBarOverlay({ color: bg, symbolColor: symbol, height: 32 })`
- **AND** the title bar area updates within one frame of the theme flip

#### Scenario: No white flash on launch
- **WHEN** the app cold-starts a project
- **THEN** the very first paint uses `backgroundColor: '#0f1115'` (or the last-persisted theme's background)
- **AND** no white/gray fallback is visible before the renderer's first paint

#### Scenario: CLI + browser is unaffected
- **WHEN** the dashboard is served from `bin/openspec-ui.js` and opened in a browser (not Electron)
- **THEN** none of the Electron-specific title-bar handling runs
- **AND** the renderer's Electron-runtime detection returns false
- **AND** no top-padding safe-area is applied
