# Tasks

## 1. Static welcome page (`electron/welcome.html`)

- [x] 1.1 Create a self-contained HTML file with inline CSS + JS. Structure: header (icon + name + description), Start section (Open Folder button), Recent section, footer meta strip (Version / License link / Repository link). All strings sourced via `window.ithynoWelcome.getAbout()`.
- [x] 1.2 Match the main app's palette. Import the same CSS variable names (`--bg-page`, `--bg-panel`, `--border`, `--fg-primary`, `--fg-muted`, `--accent`) with values pulled from `web/src/styles.css`. Selector on `:root[data-theme="dark"]` / `:root[data-theme="light"]`.
- [x] 1.3 Theme-aware: pre-paint inline `<script>` reads `prefers-color-scheme` and stamps `document.documentElement.dataset.theme` BEFORE the body paints. Mirrors the FOUC guard in `web/index.html`.
- [x] 1.4 About-style rendering: muted-label + raw value, NO string prefixes (`"v" + version`, `"License: " + license` forbidden).
- [x] 1.5 Icon loaded via base64 data URL injected by main-process handler (avoids `file://` / packaging-path pitfalls). Same source file as the packaged dock/taskbar icon.

## 2. Preload consolidation (`electron/src/preload.ts`)

- [x] 2.1 Delete `electron/src/welcome-preload.ts`. Its API surface moves into the main preload so that the SAME preload can serve both welcome.html and the main React app (required for the same-window swap).
- [x] 2.2 Extend `electron/src/preload.ts` to expose `window.ithynoWelcome` alongside the existing `window.openspecUI` / `window.ithyno`. The React app never touches it; welcome.html never touches the others.
- [x] 2.3 Preload-import guard (`scripts/check-preload-imports.mjs`) SHALL continue to pass — no node-only imports added.

## 3. Main-process wiring (`electron/src/main.ts`)

- [x] 3.1 Delete `welcomeWindow` state variable, `resolveWelcomePreload()`, `createWelcomeWindow()`, and `openProjectFromWelcome()`. The welcome view lives in the main window; no separate BrowserWindow.
- [x] 3.2 Modify `createWindowForProject(projectRoot: string | null)` to accept `null`. On `null`: skip server spawn, `loadFile(welcome.html)`. On non-null: spawn server, `loadURL(spawn.url)`. In both cases: reuse `mainWindow` if it exists (URL / file swap in place).
- [x] 3.3 `whenReady`: `createWindowForProject(saved && isDirectory(saved) ? saved : null)`. Single call; no branch to a separate welcome-creation function.
- [x] 3.4 `activate` handler: same unified call (drop the `welcomeWindow` short-circuit).
- [x] 3.5 `registerWelcomeIpc()` handlers target `mainWindow` (not `welcomeWindow`) — `open-folder` / `open-recent` invoke `createWindowForProject(picked)` which reuses `mainWindow` and swaps its URL in place.

## 4. About commonisation

- [x] 4.1 Confirmed `readAboutConfig()` returns everything needed (name/version/license/description/licenseUrl/repositoryUrl). No new fields.
- [x] 4.2 `showAboutPanel()` still uses the same `readAboutConfig()` — welcome view is an additional consumer, no duplication.
- [x] 4.3 Icon `data:` URL derived from the same PNG the OS-level icon uses (`electron/build/icon.png`) — cached at first read (`_iconDataUrlCache`).

## 5. Recent-list pruning

- [x] 5.1 `welcome:open-recent` handler removes invalid path via `store.removeFromRecent`, then pushes updated list via `webContents.send('welcome:recent-updated', ...)` on the main window's webContents.
- [x] 5.2 The main preload exposes `onRecentUpdated(cb)` returning an unsubscribe fn. welcome.html subscribes and re-renders on push.

## 6. Packaging

- [x] 6.1 `electron/package.json` `files[]` extended with `welcome.html` + `build/icon.png` so both ship in the packaged app. `welcome-preload.js` NOT listed (deleted).

## 7. Tests

- [x] 7.1 `npx tsc -p electron/tsconfig.json --noEmit` clean.
- [x] 7.2 `npm run --prefix electron build` clean (includes preload-import guard).
- [x] 7.3 `npm test` — 632 pass / 1 skipped. Electron main-process code is intentionally not covered by unit tests in this repo (Electron APIs require the packaged runtime); this change follows the same coverage shape as `add-new-project-onboarding-window` / `add-electron-new-project-flow`. Runtime verification is manual (task 8.1).
- [x] 7.4 `npm run typecheck` clean.
- [x] 7.5 `npm run openspec -- validate add-electron-welcome-window --strict` passes.

## 8. Manual verification

- [x] 8.1 Manual Electron launch verification — requires local `npm run --prefix electron dev` (or packaged binary). Confirmed. Checklist:
  - Delete the ProjectStore state file (or set saved to a nonexistent path) → main BrowserWindow opens with welcome.html loaded (no auto-picker, no second window).
  - Icon + name + version + description + license visible (no `v` / `License:` prefixes).
  - Palette matches the main app's palette when OS theme changes (light OS → light welcome; dark OS → dark welcome).
  - Recent list empty → shows "No recent projects."
  - Click Open Folder → native picker → select folder → SAME window's URL swaps to `localhost:<port>`, main React app appears. Window bounds do not change.
  - Restart with valid saved project → welcome.html skipped (window goes straight to `localhost:<port>`).
  - Manually add a recent entry that doesn't exist on disk → clicking it prunes it, welcome stays visible, list re-renders.
  - Close window while on welcome.html (no project selected) → app quits.
  - Click License link → opens license URL in system browser (external-link allowlist).
  - Click Repository link → opens repo URL in system browser.

## 9. Docs

- [x] 9.1 No CLAUDE.md changes.
- [x] 9.2 Outcome written.
