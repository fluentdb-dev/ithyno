# Delta: electron-shell — New Project menu

## ADDED Requirements

### Requirement: New Project Menu

The Electron shell SHALL provide a "File → New Project…" menu item that
scaffolds a fresh ithyno project at a user-picked path and switches the
active window to that project. This is the Electron-native counterpart
to the browser-facing `POST /api/init` (landed by
`add-init-http-endpoint`) — same underlying `runInit`, but reached via
main-process direct import and a native OS folder picker.

The menu item SHALL sit under the File submenu immediately after "Open
Project…" and SHALL bind the `CmdOrCtrl+Shift+N` accelerator.

The flow SHALL:

1. Open a native folder picker via
   `dialog.showOpenDialogSync({ properties: ['openDirectory',
   'createDirectory'], title: '...', buttonLabel: '...' })`. The
   `createDirectory: true` property surfaces the OS-native
   "New Folder" affordance so the user can create the target during
   the pick.
2. When the user cancels (no path picked), exit silently — no error
   dialog.
3. When a path is picked, dynamically import `runInit` from
   `../bin/init.js` and call it with `{ targetDir, autoCreateDir:
   true, autoGitInit: true, quiet: true }`.
4. On `runInit` failure, show `dialog.showErrorBox` with the
   `reason` field. Do NOT switch the window.
5. On `runInit` success, show a `dialog.showMessageBox` (info) with:
   - Title: "Project ready"
   - Detail: the target path, a note that `git init` ran when
     `gitInitPerformed: true`, and the exact next-step command
     (`npx -y -p @fission-ai/openspec@latest openspec init <target>
     --tools claude`) when `openspecMissing: true`.
   - After the user dismisses the dialog, delegate to `switchProject`
     (the same helper used by "Open Project…") so the window navigates
     to the new project.

The endpoint at `POST /api/init` SHALL remain available and unchanged —
the browser dashboard, headless callers, and CI tooling continue to use
it. This menu item is an alternative entry that avoids the HTTP hop.

#### Scenario: pick + init + switch (happy path)
- **GIVEN** the user chooses File → New Project…
- **AND** picks a fresh directory `/tmp/new-proj` via the OS dialog
- **AND** `/tmp/new-proj` does not exist yet (created via the dialog's New Folder button)
- **WHEN** `runInit` completes with `ok: true` and `gitInitPerformed: true`
- **THEN** an info dialog shows the target path plus the `openspec init` next-step command, and the window switches to `/tmp/new-proj` after the dialog closes

#### Scenario: user cancels the folder picker
- **GIVEN** the user opens File → New Project…
- **WHEN** they dismiss the picker without choosing a folder
- **THEN** nothing happens — no error dialog, no menu state change, current project remains active

#### Scenario: runInit fails
- **GIVEN** the user picks a path where `runInit` cannot scaffold (e.g. a directory the process can't write to)
- **WHEN** `runInit` returns `{ ok: false, reason: "..." }`
- **THEN** `dialog.showErrorBox` displays the reason and the current window stays on the previous project

#### Scenario: existing non-git folder → auto git init
- **GIVEN** the user picks an existing non-empty folder that is not a git repo
- **AND** the folder is writable
- **WHEN** `runInit` runs with `autoGitInit: true`
- **THEN** `git init` runs in the folder, the scaffold proceeds, the success dialog notes that `git init` ran, and the window switches to the folder

#### Scenario: POST /api/init unchanged
- **GIVEN** the browser dashboard sends a `POST /api/init` request
- **WHEN** the request is authenticated and local
- **THEN** it succeeds identically to before this change — the Electron menu item is an alternative, not a replacement
