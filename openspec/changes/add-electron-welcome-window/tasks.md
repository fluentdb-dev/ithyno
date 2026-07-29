# Tasks

## 1. Static welcome page

- [ ] 1.1 Create `electron/welcome.html` — a self-contained HTML file with inline CSS matching the app's dark chrome (`#0f1115` background). Structure: `<header>` with icon + name + version, `<section>` with description + license, `<section>` with Recent projects list, `<footer>` with the Open Folder button + optional external links. All strings come from IPC (`window.ithynoWelcome.getAbout()`), not hard-coded.
- [ ] 1.2 Load the icon inline as `<img src="./build/icon.png">` (or as a `data:` URI passed via IPC to survive packaging path shifts). Ship the same `electron/build/icon.png` used for the dock/taskbar icon.
- [ ] 1.3 Style: fixed window size ~500×420, no browser chrome affordances (no menu, no reload). Cannot resize.

## 2. Welcome preload

- [ ] 2.1 Create `electron/src/welcome-preload.ts` (new). Expose `window.ithynoWelcome` with:
  - `getAbout(): Promise<AboutConfig>` — invokes `welcome:get-about`
  - `getRecent(): Promise<string[]>` — invokes `welcome:get-recent`
  - `openFolder(): void` — sends `welcome:open-folder`
  - `openRecent(path: string): void` — sends `welcome:open-recent`
  - `openExternal(url: string): void` — sends `welcome:open-external`
  - `quit(): void` — sends `welcome:quit` (used by window close intent)
- [ ] 2.2 Preload uses `contextBridge.exposeInMainWorld` for safe context isolation (matches existing preload style).

## 3. Main-process wiring

- [ ] 3.1 In `electron/src/main.ts`, add `createWelcomeWindow(aboutConfig: AboutConfig): BrowserWindow` — a small `BrowserWindow` with `webPreferences.preload = welcome-preload`, `resizable: false`, `width: 520, height: 440`, no menu.
- [ ] 3.2 Modify `whenReady()`: if `store.getLastProject()` is a valid directory → keep the current auto-open. Otherwise → `createWelcomeWindow(aboutConfig)` instead of falling straight to `pickProjectDialog()`.
- [ ] 3.3 On welcome window close, if no main project window opened yet, `app.quit()`.
- [ ] 3.4 Register IPC handlers:
  - `welcome:get-about` → returns `readAboutConfig()`
  - `welcome:get-recent` → returns `store.getRecent()` (existing method)
  - `welcome:open-folder` → invokes `pickProjectDialog(welcomeWindow)` → on selection, calls `createWindowForProject(path)` + closes welcome window; on cancel, welcome stays open
  - `welcome:open-recent` → validates `isDirectory(path)`, then same flow; if invalid, `removeFromRecent` + broadcast updated recent to welcome window
  - `welcome:open-external` (url) → whitelist check (must match `aboutConfig.licenseUrl` or start with `aboutConfig.repositoryUrl`) then `shell.openExternal(url)`
  - `welcome:quit` → `app.quit()`

## 4. About commonisation

- [ ] 4.1 Confirm `readAboutConfig()` returns everything the welcome window needs (name, version, license, description, licenseUrl, repositoryUrl). It already does per current shape.
- [ ] 4.2 No changes to `app.setAboutPanelOptions` or `showAboutPanel()` — welcome window just consumes the same source.
- [ ] 4.3 If any welcome-only fields creep in (they should NOT), refactor `buildAboutInfo` to expose them rather than duplicating logic in main.ts.

## 5. Recent-list pruning

- [ ] 5.1 `welcome:open-recent` handler MUST call `store.removeFromRecent(path)` when the path is invalid, then push an updated recent list back to the welcome window (via `webContents.send('welcome:recent-updated', paths)`).
- [ ] 5.2 Welcome preload subscribes to `welcome:recent-updated` and updates its state; the HTML re-renders the list.

## 6. Tests

- [ ] 6.1 `electron/src/main.test.ts` (or a new file) — verify `whenReady` opens the welcome window when `getLastProject()` returns null or invalid; opens the main window directly when it returns a valid dir. Mock `store`, `pickProjectDialog`, and `createWindowForProject`.
- [ ] 6.2 IPC handler tests — `welcome:get-about` returns the same `AboutConfig` as `readAboutConfig()`; `welcome:open-recent` with an invalid path triggers `removeFromRecent` and broadcasts the updated list; `welcome:open-external` refuses URLs not in the allowlist.
- [ ] 6.3 No test for the HTML rendering itself — it's a static file with vanilla JS. The IPC contract tests cover the interface it consumes.

## 7. Verification

- [ ] 7.1 `npm test` — new IPC handler tests pass; existing tests unaffected.
- [ ] 7.2 `npm run typecheck` clean.
- [ ] 7.3 `npm run build` clean; `electron-builder` picks up `welcome.html` and `welcome-preload.js` (add to `files` if needed).
- [ ] 7.4 `npm run openspec -- validate add-electron-welcome-window --strict` passes.
- [ ] 7.5 Manual Electron test:
  - Delete `~/.config/ithyno/state.json` (or platform equivalent) to simulate first launch → welcome window opens showing icon + name + version + license, no recent projects yet, Open Folder button.
  - Click Open Folder → native picker → select a folder → welcome closes, main window opens.
  - Restart app → welcome window is skipped (saved project auto-opens).
  - Delete state again but manually add a Recent entry via file → welcome shows it as clickable.
  - Click a recent that's since been deleted from disk → entry disappears from the list, welcome stays open.
  - Close the welcome window (X) with no project selected → app quits.
- [ ] 7.6 Write `outcome.md`.

## 8. Docs

- [ ] 8.1 No CLAUDE.md changes.
- [ ] 8.2 If `electron-builder` config needs `files` updates for `welcome.html` + `welcome-preload.js`, note in `electron/package.json` diff.
