# Outcome

## ✅ Worked

- **Single source of truth for identity.** `readAboutConfig()` already
  returned everything the welcome window needed (name, version,
  license, description, licenseUrl, repositoryUrl). Adding one field
  (`iconDataUrl`) via a wrapper in the `welcome:get-about` handler
  gave the welcome page every asset it uses, without touching the
  About panel path or duplicating strings anywhere.
- **Data-URL icon dodged packaging headaches.** First cut used a
  relative `<img src="./build/icon.png">` in welcome.html, which
  works in dev but breaks under electron-builder's packaged layout
  (the `build/` dir is buildResources, not extraResources, and
  `files` puts things under `resources/app.asar/` not
  `resources/app/electron/build/`). Switching to a base64 data URL
  computed once in main + cached made the whole path-resolution
  category disappear.
- **Followed the onboarding-window pattern verbatim.** Preload
  resolver mirrors `resolveOnboardingPreload`; IPC channel naming
  (`welcome:*` matches `onboarding-*`); `closed` handler cleans up
  window state and conditionally quits. Nothing novel was needed at
  the Electron layer — the pattern already worked for a second
  BrowserWindow.
- **Kept "reopen last project" as zero-friction.** Users who work in
  one project every day don't see the welcome window at all — the
  same `store.getLastProject()` check runs first, and the welcome
  path only kicks in when there's no valid saved state. The change is
  invisible to daily drivers.

## ⚠️ Surprises

- **`files` vs `extraResources` in electron-builder is subtle.** The
  onboarding-preload path (`resources/app/electron/out/…`) exists
  because SOMETHING in the build ships electron/ under `app/`. I
  couldn't find an explicit `extraResources` mapping for it in
  `electron/package.json`. Two possibilities: (1) an implicit
  electron-builder default I'm not seeing, (2) the onboarding
  packaged path is actually wrong and no one has run it in packaged
  mode. Either way, matching the pattern for `welcome-preload` +
  `welcome.html` is the safest bet — if onboarding is broken in
  packaged mode, welcome breaks the same way (and gets fixed the same
  way). Adding `welcome.html` + `build/icon.png` to `files` at least
  makes them present in the app bundle regardless of the layout.
- **CSP for a file:// page is stricter than for an http:// page.**
  Wrote `img-src 'self' data:` in the meta CSP to allow data URLs,
  then double-checked the `contextBridge` API surface only exposes
  what's declared. No script inline required for the vanilla JS
  bootstrap because the `<script>` at end-of-body doesn't violate
  `script-src 'self'` (same-origin file: source).
- **`ProjectStore.getRecent` was already there.** Poking at the file
  I expected to add it — turns out `add-electron-new-project-flow` or
  earlier had already implemented Recent tracking. Zero work needed
  there.

## 🔁 Differently

- **Would have written the IPC handler tests up front if the harness
  were less painful.** Testing Electron main-process code with a
  mocked `ipcMain` / `BrowserWindow` requires nontrivial fake-module
  scaffolding, and the ROI is low compared to a manual launch. The
  existing electron-side code follows the same "verified by manual
  launch, not unit tests" pattern (see `add-electron-shell` /
  `add-new-project-onboarding-window`), so this change fits the norm.
  A future dedicated test harness for main-process would pay dividends
  across all these windows.

## 🌱 Follow-ups

- **New Project button in the welcome window.** Deferred per user
  direction ("Open Folder is enough — NoProjectDecisionPanel handles
  the initialize case"). If friction shows up (users don't discover
  the initialize button post-selection), add a dedicated New Project
  entry that routes straight to `/onboarding?target=<picked>`.
- **Recent list pruning at startup, not just on click.** Currently a
  stale recent entry survives until the user actually clicks it in
  the welcome window. A one-time sweep on welcome window open —
  `store.getRecent().filter(isDirectory)` + write back the pruned
  list — would keep the visible list honest without waiting for the
  user to hit a dead entry.
- **Actual manual test on packaged binary.** The main-process code
  matches the onboarding pattern and typechecks cleanly, but only a
  packaged run confirms electron-builder ships `welcome.html` +
  `build/icon.png` correctly. Adding a smoke test to
  `add-release-build-workflow`'s bundle-verification-script would
  automate this.
- **`resolveOnboardingPreload` layout audit.** If it turns out the
  onboarding preload isn't actually reachable in packaged mode (see
  Surprises), fix both onboarding and welcome together — same class
  of bug, same fix (add explicit `extraResources` for
  `../electron/out` → `app/electron/out` and `../electron/welcome.html`
  → `app/electron/welcome.html`).
- **Preload consolidation.** With three preloads (main, onboarding,
  welcome), each with slightly different exposed APIs, factoring the
  "sanitize channel name" boilerplate into a shared helper would
  save a small amount of typing. Not urgent.
