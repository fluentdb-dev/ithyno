# Delta: electron-shell — Onboarding window + openspec init chain

## MODIFIED Requirements

### Requirement: New Project Menu

The Electron shell SHALL provide a "File → New Project…" menu item that
scaffolds a fresh ithyno project at a user-picked path AND installs
OpenSpec into it, then switches the active window to the new project
after the user confirms. This is the Electron-native counterpart to
the browser-facing `POST /api/init` (landed by
`add-init-http-endpoint`) — same underlying `runInit`, but reached via
main-process direct import and a native OS folder picker, PLUS an
auto-chained `openspec init` step that the browser flow does not run.

The menu item SHALL sit under the File submenu immediately after "Open
Project…" and SHALL bind the `CmdOrCtrl+Shift+N` accelerator.

The flow SHALL:

1. Open a native folder picker via
   `dialog.showOpenDialogSync({ properties: ['openDirectory',
   'createDirectory'], title: '...', buttonLabel: '...' })`. The
   `createDirectory: true` property surfaces the OS-native "New Folder"
   affordance so the user can create the target during the pick.
2. When the user cancels (no path picked), exit silently — no error
   dialog, no state change.
3. When a path is picked, open a dedicated **onboarding window**
   (640×480 BrowserWindow, parent = main window, non-blocking). Do
   NOT `await` the chain in the main window's event loop; the
   onboarding window drives its own lifecycle.
4. Run `runNewProjectChain(target, onEvent)` in the main process.
   The chain is two sequential steps:
   - **`scaffold`** — invoke `runInit({ targetDir: target,
     autoCreateDir: true, autoGitInit: true, quiet: true })` and
     forward its `log` callback lines as `type: log` events with
     `step: 'scaffold'`.
   - **`openspec-init`** — spawn `npx -y -p @fission-ai/openspec@latest
     openspec init <target> --tools claude` as a child process with
     `cwd: target`. Every stdout/stderr chunk becomes a `type: log`
     event with `step: 'openspec-init'` and the corresponding `stream`
     field.
   The chain SHALL emit `step-start` before each step, `step-done`
   after each successful step, `complete` after both steps succeed,
   and `error` on the first failing step (subsequent steps skipped).
5. Stream every event to the onboarding window via IPC channel
   `onboarding-event`.
6. The onboarding window SHALL display:
   - The target path in a subtitle.
   - The two steps with status icons (`pending`, `in-progress`, `done`,
     `failed`) and their labels ("Scaffold ithyno files", "Install
     OpenSpec").
   - A scrollable log pane that accumulates `type: log` lines, capped
     at ~200 lines (ring buffer).
   - A **"Close"** button (always enabled) that closes the window
     WITHOUT switching the main window.
   - An **"Open Project"** button (disabled until `complete` arrives)
     that on click sends an IPC message to close the onboarding window
     and calls `switchProject(target)` in the main process.
7. On chain `error`, mark the failing step's icon as `failed`, keep
   the log visible, keep "Open Project" disabled, and rely on the
   user closing via "Close". The main window remains on its previous
   project.
8. Closing the onboarding window mid-chain does NOT kill the running
   subprocesses — they run to completion in the main process. Post-
   close events are dropped silently.

The endpoint at `POST /api/init` and the browser-side New Project
form in Settings SHALL remain available and unchanged. The
browser-facing flow does NOT auto-chain `openspec init` in this
change; that is a separate follow-up.

#### Scenario: pick + scaffold + openspec init + switch (happy path)
- **GIVEN** the user chooses File → New Project…
- **AND** picks a fresh directory `/tmp/new-proj` via the OS dialog
- **AND** the `openspec` npm package is already cached (fast path)
- **WHEN** the onboarding window opens
- **AND** both steps complete without error
- **THEN** the onboarding window shows both steps as ✓, the log ends with the openspec init success line, "Open Project" becomes enabled
- **AND** clicking "Open Project" closes the onboarding window and switches the main window to `/tmp/new-proj` (which now contains `.claude/skills/openspec-*`, `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/`, plus the scaffold files from step 1)

#### Scenario: cold npx cache — long openspec init step
- **GIVEN** the onboarding window is running the `openspec-init` step
- **AND** the npx package download takes 25 seconds
- **WHEN** the child process emits progress lines (npm download, install, "OpenSpec structure created")
- **THEN** each line appears in the log pane in real time and the step icon stays as `in-progress` throughout

#### Scenario: user cancels the folder picker
- **GIVEN** the user opens File → New Project…
- **WHEN** they dismiss the picker without choosing a folder
- **THEN** nothing happens — no error dialog, no onboarding window opens, no menu state change

#### Scenario: scaffold step fails
- **GIVEN** the user picks a path where `runInit` cannot scaffold (e.g. a directory the process can't write to)
- **WHEN** `runInit` returns `{ ok: false, reason: "..." }`
- **THEN** the onboarding window marks the `scaffold` step as ✗, appends the reason to the log, does NOT run the `openspec-init` step, and keeps "Open Project" disabled; the main window stays on its previous project

#### Scenario: openspec init step fails
- **GIVEN** the `scaffold` step completed successfully
- **AND** `openspec init` exits non-zero (network failure, disk full, package registry down)
- **WHEN** the child process exits with a non-zero code
- **THEN** the onboarding window marks the `openspec-init` step as ✗, appends the last stderr lines to the log, and keeps "Open Project" disabled; the main window stays on its previous project; the target directory is left in a partial state (scaffold files present, openspec/ missing)

#### Scenario: closing the onboarding window mid-chain
- **GIVEN** the chain is in the middle of `openspec-init` (subprocess running)
- **WHEN** the user clicks "Close" on the onboarding window
- **THEN** the window closes, the subprocess is NOT killed and runs to completion, subsequent progress events are dropped silently, the main window remains on its previous project, and no auto-switch happens

#### Scenario: existing scaffolded folder — re-run
- **GIVEN** the user picks a directory that was previously scaffolded (existing `CLAUDE.md`, `openspec/`, etc.)
- **WHEN** the chain runs
- **THEN** `runInit` reports `skip: ...` for each existing file (visible in the log), `openspec init` detects the existing config and either updates or reports no-op, both steps complete, "Open Project" becomes enabled

#### Scenario: concurrent onboarding windows
- **GIVEN** the user opens File → New Project… once and picks folder A
- **AND** while A's onboarding window is running, opens File → New Project… again and picks folder B
- **WHEN** both chains run in parallel
- **THEN** two independent onboarding windows exist, each showing its own progress; both eventually complete or fail independently
