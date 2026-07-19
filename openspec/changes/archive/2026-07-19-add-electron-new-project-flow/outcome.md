# Outcome — add-electron-new-project-flow

## ✅ Worked

- **Menu → dialog → runInit → switchProject flow is straightforward.**
  ~70 lines in `main.ts`, one new item in `menu.ts`, no changes to
  preload/renderer. Matches the shape of the existing "Open Project…"
  flow.
- **Dynamic ESM import from CJS TS main process works** — `await
  import(pathToFileURL(initPath).href)` compiles cleanly through
  `module: CommonJS` and TypeScript preserves the dynamic import at
  runtime. No bundler tricks needed.
- **`showOpenDialogSync` with `properties: ['openDirectory',
  'createDirectory']`** — the OS-native "New Folder" affordance
  eliminates the need for a custom project-name prompt. Users create
  the folder in the OS dialog and pick it in one action.
- **Reuses the existing `switchProject` helper** — the window teardown
  + respawn logic is battle-tested from Open Project… / Open Recent.
  No duplicated code paths.

## ⚠️ Surprises

- **Manual verify tasks 4.4 / 4.5 are deferred.** VS Code terminal
  cannot drive interactive Electron dialogs, so the smoke test of the
  actual native picker + resulting window transition is left for a
  user-side run. Code paths compile and typecheck; the runtime
  behavior is a straight composition of `pickNewProjectDialog` (mirror
  of `pickProjectDialog`) + `runInit` (already tested at unit level in
  `server/init.test.ts`) + `switchProject` (unchanged).
- **The `runInit` module type import** requires an inline `as {...}`
  cast because we're dynamic-importing across the TS/JS boundary. Kept
  the cast local (inside `onNewProject`) rather than adding an ambient
  declaration — the alternative would be to move the type to a shared
  `bin/init.d.ts` re-export.

## 🔁 Differently next time

- **Ship an integration test for the Electron flow.** Spectron is
  deprecated, but Playwright supports Electron via
  `_electron.launch()`. A single test that launches, clicks the menu,
  and asserts window navigation would cover the smoke path without
  requiring interactive verification.
- **Consider a shared "smoke script"** at `electron/scripts/` that runs
  the same flow programmatically (spawn Electron with a fake
  `SHOW_OPEN_DIALOG` stub). Would let the user verify by running one
  command instead of clicking through the menu.

## 🌱 Follow-ups

- **`add-vscode-new-project-command`**: same shape for the VS Code
  extension. `vscode.window.showOpenDialog` + `showInputBox` +
  `runInit` + `vscode.commands.executeCommand('vscode.openFolder', ...)`.
- **Playwright Electron smoke test**: automate the manual verify tasks
  (4.4 / 4.5).
- **File → New Project… in the browser dashboard** (when the shell is
  standalone) — could add a "Create in current dir + open" button in
  Settings' NewProjectSection, which shells out to `POST /api/init`
  and then reloads the page with the new `--dir` query. Deferred until
  the CLI/browser channel gets more explicit UX love.
