# Delta: electron-shell — New Project Menu opens the shared onboarding page

## MODIFIED Requirements

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
