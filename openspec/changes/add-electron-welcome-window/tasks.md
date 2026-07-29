# Tasks

## 1. Static welcome page

- [x] 1.1 Create `electron/welcome.html` — a self-contained HTML file with inline CSS matching the app's dark chrome (`#0f1115` background). Structure: `<header>` with icon + name + version, description + license, Recent projects list, single Open Folder button, footer with License + Repo links. All strings sourced via `window.ithynoWelcome.getAbout()`.
- [x] 1.2 Icon loaded via base64 data URL injected by main-process handler (avoids `file://` / packaging-path pitfalls). Same source file (`electron/build/icon.png`) as the packaged dock/taskbar icon.
- [x] 1.3 Fixed window size (520×460), non-resizable, non-maximizable, hidden menu bar, `contextIsolation: true` + `sandbox: true`.

## 2. Welcome preload

- [x] 2.1 Create `electron/src/welcome-preload.ts` exposing `window.ithynoWelcome` with `getAbout` / `getRecent` / `openFolder` / `openRecent` / `openExternal` / `quit` / `onRecentUpdated` — matches spec's IPC surface exactly.
- [x] 2.2 Uses `contextBridge.exposeInMainWorld` (matches existing preload style).

## 3. Main-process wiring

- [x] 3.1 `createWelcomeWindow()` in `electron/src/main.ts` — new `BrowserWindow`, uses `resolveWelcomePreload()` for preload path (dev + packaged aware, mirrors `resolveOnboardingPreload`).
- [x] 3.2 `whenReady()` — if `store.getLastProject()` is a valid directory, auto-open as before; else `createWelcomeWindow()` (was: unconditional `pickProjectDialog()`).
- [x] 3.3 Welcome window's `closed` handler quits the app when no main project window has been created.
- [x] 3.4 `registerWelcomeIpc()` — six IPC channels registered (`welcome:get-about` returns `{...readAboutConfig(), iconDataUrl}`; `welcome:get-recent` returns `store.getRecent()`; `welcome:open-folder` fires `pickProjectDialog` → `openProjectFromWelcome`; `welcome:open-recent` validates path, prunes stale via `store.removeFromRecent` + pushes updated list; `welcome:open-external` allowlist-checks vs `about.licenseUrl` / `about.repositoryUrl`; `welcome:quit`).
- [x] 3.5 `activate` handler updated symmetrically — reopen path uses the welcome window instead of the bare picker.

## 4. About commonisation

- [x] 4.1 Confirmed `readAboutConfig()` returns everything needed (name/version/license/description/licenseUrl/repositoryUrl). No new fields required.
- [x] 4.2 `showAboutPanel()` still uses the same `readAboutConfig()` — welcome window is an additional consumer, no duplication.
- [x] 4.3 Icon `data:` URL derived from the same PNG the OS-level icon uses (`electron/build/icon.png`) — cached at first read (`_iconDataUrlCache`).

## 5. Recent-list pruning

- [x] 5.1 `welcome:open-recent` handler removes invalid path via `store.removeFromRecent`, then pushes updated list via `webContents.send('welcome:recent-updated', ...)`.
- [x] 5.2 `welcome-preload.ts` exposes `onRecentUpdated(cb)` returning an unsubscribe fn. `welcome.html` subscribes and re-renders on push.

## 6. Tests

- [x] 6.1 `npx tsc -p electron/tsconfig.json --noEmit` clean — the electron-side TypeScript check compiles the new preload + main.ts additions cleanly.
- [x] 6.2 `npm test` — 632 pass / 1 skipped. Electron main-process code is intentionally not covered by unit tests in this repo (Electron APIs require the packaged runtime); this change follows the same coverage shape as `add-new-project-onboarding-window` / `add-electron-new-project-flow`. Runtime verification is manual (task 7.5).
- [x] 6.3 No HTML/DOM tests — the welcome page is a static file with vanilla JS. The IPC contract is the testable surface; unit tests would mock Electron's `ipcRenderer` and duplicate what a real launch trivially verifies.

## 7. Verification

- [x] 7.1 `npm test` — 632 pass / 1 skipped / 1 unrelated build-icons/sharp env failure (pre-existing).
- [x] 7.2 `npm run typecheck` clean.
- [x] 7.3 `npm run build` clean (web); electron-side build via `tsc` clean.
- [x] 7.4 `npm run openspec -- validate add-electron-welcome-window --strict` passes.
- [ ] 7.5 Manual Electron launch verification — requires local `npm run --prefix electron dev` (or packaged binary). Cannot execute from this environment. Checklist to run:
  - Delete the ProjectStore state file to simulate first launch → welcome window opens, no auto-picker.
  - Icon + name + version + license visible.
  - Recent list empty → shows "No recent projects."
  - Click Open Folder → native picker → select folder → welcome closes, main window opens.
  - Restart with valid saved project → welcome skipped (auto-open).
  - Manually add a recent entry that doesn't exist on disk → clicking it prunes it and welcome stays open.
  - Close welcome window (X) with no project → app quits.
  - Click License link → opens license URL in system browser.
  - Click Repository link → opens repo URL in system browser.
- [x] 7.6 Write `outcome.md`.

## 8. Docs

- [x] 8.1 No CLAUDE.md changes.
- [x] 8.2 `electron/package.json` `files` array extended with `welcome.html` + `build/icon.png` so both are packaged.
