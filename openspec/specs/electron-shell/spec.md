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

### Requirement: New Project Menu

The Electron shell SHALL provide a "File → New Project…" menu item that
opens a native folder picker and then opens a small child BrowserWindow
loading the shared `/onboarding` page from the local server. The
onboarding page (defined by `dashboard` capability's `Onboarding Project
Page` requirement) drives the two-step chain
(scaffold → openspec init), streams progress, and — when the user
clicks "Open Project" — signals the main process to switch to the new
project.

The menu item SHALL sit under the File submenu immediately after "Open
Project…" and SHALL bind the `CmdOrCtrl+Shift+N` accelerator.

The flow SHALL:

1. Open a native folder picker via
   `dialog.showOpenDialogSync({ properties: ['openDirectory',
   'createDirectory'], title: '...', buttonLabel: '...' })`. The
   `createDirectory: true` property surfaces the OS-native "New Folder"
   affordance so the user can create the target during the pick.
2. When the user cancels (no path picked), exit silently — no error
   dialog, no state change, no BrowserWindow.
3. When a path is picked, open a child BrowserWindow (parent = main
   window, 640×540, non-modal) that `loadURL`s the current server URL
   with the path
   `/onboarding?target=<absolute-path>&channel=electron`. The
   onboarding page in the loaded URL is the shared React page.
4. Register an IPC handler for the `onboarding-open` channel. When
   the onboarding page sends `onboarding-open` (via its preload
   bridge, on "Open Project" button click), the main process SHALL:
   - Close the onboarding BrowserWindow.
   - Call `switchProject(target)` — the same helper used by "Open
     Project…" and "Open Recent" — to tear down the current server
     and spawn a fresh one for the new target.
5. Do NOT `await` the chain in the main window's event loop. The
   onboarding BrowserWindow drives its own progress display; the main
   process only reacts to the "Open Project" IPC.
6. If the user closes the onboarding BrowserWindow via the window
   controls (title-bar close or "Close" button in the page), the
   main process SHALL do nothing — no switch, no error. The chain
   (running server-side via the `POST /api/init/stream` endpoint) is
   uncancellable in this iteration; post-close progress events are
   dropped by the closed page's now-defunct EventSource.

The endpoint at `POST /api/init` (synchronous, non-streaming) and the
browser-side Settings New Project form SHALL remain available and
unchanged. The Electron menu no longer calls `runInit` directly from
the main process — it delegates entirely to the shared onboarding
page.

#### Scenario: pick + onboarding + open (happy path)
- **GIVEN** the user chooses File → New Project…
- **AND** picks a fresh directory `/tmp/new-proj` via the OS dialog
- **WHEN** the child BrowserWindow opens loading `/onboarding?target=/tmp/new-proj&channel=electron`
- **AND** the onboarding page streams both steps to completion
- **AND** the user clicks "Open Project"
- **THEN** the page sends `onboarding-open` via the preload bridge, main closes the child window and calls `switchProject('/tmp/new-proj')`, and the main window navigates to the new project's server URL

#### Scenario: user cancels the folder picker
- **GIVEN** the user opens File → New Project…
- **WHEN** they dismiss the picker without choosing a folder
- **THEN** no BrowserWindow opens, no server request is made, the current project remains active

#### Scenario: user closes the onboarding BrowserWindow mid-chain
- **GIVEN** the onboarding page is mid-chain (streaming step 2 log lines)
- **WHEN** the user clicks the OS window-close button on the child BrowserWindow
- **THEN** the child window closes, no IPC message is sent to main, the main window stays on its previous project, and the server-side subprocess continues to completion (log lines that arrive after close are dropped by the now-disconnected EventSource)

#### Scenario: main window still interactive during onboarding
- **GIVEN** the onboarding BrowserWindow is open (parent = main)
- **WHEN** the user clicks in the main window
- **THEN** the main window remains fully interactive (the onboarding window is non-modal); the user can continue browsing changes, running commands, etc.

#### Scenario: error step keeps "Open Project" disabled
- **GIVEN** the onboarding page displays a failed step (either scaffold or openspec-init)
- **WHEN** the user tries to click "Open Project"
- **THEN** the button is disabled and no IPC is sent; the user must dismiss the window via "Close" or the OS title-bar

### Requirement: Preload sandbox import guard

The build system SHALL verify that `electron/src/preload.ts` and every file it transitively imports do not reference Electron main-process modules or any bare module outside a preload-safe allowlist. The verification SHALL run before `tsc` in the electron workspace's `build` and `dev` scripts and SHALL exit non-zero on violation.

#### Scenario: Direct main-process import in preload is rejected

- **GIVEN** `electron/src/preload.ts` contains `import { app } from 'electron';` (or any other main-process-only named import like `Menu`, `shell`, `dialog`, `BrowserWindow`, `ipcMain`)
- **WHEN** `npm run build` (or `npm run dev`) is invoked in the electron workspace
- **THEN** the preload import guard exits non-zero BEFORE `tsc` runs
- **AND** the error message names `electron/src/preload.ts`, the offending specifier `app`, and the source module `electron`

#### Scenario: Transitive main-process import via local module is rejected

- **GIVEN** `electron/src/preload.ts` contains `import { X } from './menu';`
- **AND** `electron/src/menu.ts` contains `import { app, Menu, shell } from 'electron';`
- **WHEN** the guard runs
- **THEN** it walks from preload into `./menu`, detects the disallowed `electron` import there, and exits non-zero
- **AND** the error message names `electron/src/menu.ts`, the offending specifier(s) `app`/`Menu`/`shell`, AND the reach path `electron/src/preload.ts → ./menu`

#### Scenario: Preload-safe imports pass

- **GIVEN** `electron/src/preload.ts` only imports `contextBridge` and `ipcRenderer` from `electron`, plus any purely-local files that themselves only import preload-safe modules
- **WHEN** the guard runs
- **THEN** it exits 0 and prints a success line naming the number of files walked

#### Scenario: Guard runs before tsc in dev + build

- **WHEN** either `npm --workspace ithyno-electron run build` or `npm --workspace ithyno-electron run dev` is invoked
- **THEN** the sequence is: `check-preload-imports` → `sync-about-config` → `tsc` (→ `electron .` for dev)
- **AND** if the guard fails, `tsc` is never invoked and no `electron/out/*.js` is written from this run

### Requirement: Preload-safe allowlist is explicit

The guard SHALL define its allowlist as an explicit constant in the script, not as an implicit rule. Adding a new allowed import surface (e.g., a new preload-safe helper module in a different directory) SHALL be a deliberate edit to that constant.

#### Scenario: Allowlist visible at top of script

- **WHEN** a reader opens `scripts/check-preload-imports.mjs`
- **THEN** an allowlist constant is visible near the top of the file
- **AND** its comment names which `electron` symbols are considered preload-safe (`contextBridge`, `ipcRenderer`) and which pattern of relative imports are recursed into

#### Scenario: Extending the allowlist is a code change

- **GIVEN** a maintainer wants to permit a new preload-safe import surface
- **WHEN** they add it to the allowlist constant
- **THEN** the change is a normal spec-driven proposal (or trivial edit, per project convention), reviewed as any other source edit
- **AND** no runtime override, environment variable, or CLI flag can loosen the allowlist

### Requirement: Stable Dashboard Session Endpoint
The Electron shell SHALL assign one port and one session token to the active project's dashboard session and SHALL keep both values unchanged until the application quits or switches projects.

#### Scenario: Renderer session reload preserves endpoint
- **GIVEN** an Electron dashboard session with a healthy project server
- **WHEN** the renderer requests `ithyno:reload-session`
- **THEN** Electron reloads the current authenticated launch URL without stopping or respawning the server
- **AND** the server port and session token remain unchanged

#### Scenario: Focus recovery preserves endpoint
- **GIVEN** Manager and worker CLIs are running with the current dashboard endpoint
- **WHEN** the Electron window loses focus and later recovers its renderer session
- **THEN** those CLIs retain a valid endpoint and token without being restarted

#### Scenario: Same-session child recovery reuses endpoint
- **GIVEN** recovery genuinely requires replacing the server child without switching projects
- **WHEN** Electron respawns that child inside the same dashboard session
- **THEN** it supplies the session's existing port and token to the replacement child

#### Scenario: Stable port cannot be rebound
- **GIVEN** a same-session child recovery must reuse the existing port
- **WHEN** another process prevents that port from being rebound
- **THEN** Electron reports recovery failure instead of silently selecting a different endpoint

#### Scenario: Project switch starts new endpoint identity
- **WHEN** the user switches to a different project
- **THEN** Electron ends the current dashboard session and creates a new port/token identity for the new project

