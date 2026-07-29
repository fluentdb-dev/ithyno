---
tags: [electron-shell, ux, welcome, onboarding, first-launch, about]
execution: worktree
---

## Why

Electron's first launch (no saved project, or the saved project no
longer exists) drops the user directly into a native OS "Select
folder" dialog with title `Select an OpenSpec project folder`. There
is no context ahead of it:

- No app identity — the dialog looks like any file picker on the OS.
- No explanation of why a folder is being asked for.
- No shortcut for the common cases (recent projects, "just show me
  the app").
- Cancel = the app quits silently, with no feedback.

The dialog itself is fine as a picker; the problem is that it's the
FIRST thing the user sees, with no framing. Every other IDE with a
similar workflow (VSCode, Cursor, Zed) uses a welcome page between
"the app started" and "the user picked a folder", showing identity +
recent + a single explicit action.

## What Changes

### Architecture: same-window swap (Electron-only)

The welcome view is a static HTML page (`electron/welcome.html`)
loaded into the **same BrowserWindow** that becomes the main app
window. When the user picks a folder, the server spawns and the
window's URL swaps in place to `localhost:<port>` — the window
instance, its bounds, its preload, and its menu bar all persist. No
second BrowserWindow, no visible "welcome closes → main opens"
flicker.

This is scoped to the **Electron shell only**. The web-mode entry
point (browser tab pointed at a running server) and VS Code
extension both already have their own project-selection UX and are
unchanged.

### 1. `welcome.html` — static page loaded into the future-main window

- Sized like the main app (defaults 900×640, resizable, respects the
  persisted window bounds so a returning user sees "the same window
  I resized before").
- Content sourced via IPC from the same `readAboutConfig()` the
  About panel uses (single source of truth):
  - App icon (base64 data URL, inlined by the main process to sidestep
    file:// / packaging-path issues).
  - App name, version, description, license — displayed
    About-panel-style (muted label + raw value, no `"v" + version` /
    `"License: " + license` string concatenation).
  - Recent projects list (`ProjectStore.getRecent()`), each item
    clickable → opens that project in the SAME window.
  - `Open Folder…` button → invokes `pickProjectDialog()` and, on
    selection, calls `createWindowForProject(picked)` which swaps
    the URL in place.
  - Footer meta strip: Version / License link / Repository link.
    External links go through `shell.openExternal` with URL
    allowlist against `about.licenseUrl` / `about.repositoryUrl`.
- Theme-aware: CSS palette selected by `data-theme` + a pre-paint
  inline script that reads `prefers-color-scheme`. Mirrors the main
  app's palette so the welcome view visually matches whatever the OS
  is set to (dark or light). Does not read the app's stored theme
  preference — that lives in the web renderer's localStorage which
  is a different origin from `file://` and thus not shared.

### 2. `createWindowForProject(projectRoot: string | null)`

The single window-lifecycle entry point in `electron/src/main.ts`.

- `projectRoot === null` → skip server spawn, `loadFile(welcome.html)`.
- `projectRoot !== null` → spawn server, `loadURL(spawn.url)`.
- If `mainWindow` already exists, reuse it (loadURL / loadFile on
  the existing instance) — no `.close()`, no re-create, no bounds
  reset.

### 3. Unified preload

The welcome view's IPC surface (`window.ithynoWelcome`) is exposed
from the main preload (`electron/src/preload.ts`) alongside
`window.openspecUI` / `window.ithyno`. This is what makes the
same-window swap work: preload is fixed at BrowserWindow construction
time, so a single preload has to serve both `welcome.html` and the
React app. The React app never touches `ithynoWelcome`; welcome.html
never touches the other two.

### 4. First-launch flow (main.ts `whenReady`)

- Valid saved project → `createWindowForProject(saved)` — server
  spawns, main React app loads. Zero-friction daily-driver path.
- No / stale saved → `createWindowForProject(null)` — window opens
  on welcome.html.
- Closing the window while no project is loaded quits the app (the
  standard `window-all-closed` handler, unchanged).

### 5. IPC channels (welcome-only, defined on the main preload)

- `welcome:get-about` → returns `AboutConfig + iconDataUrl`
- `welcome:get-recent` → returns `ProjectStore.getRecent()`
- `welcome:open-folder` → invokes `pickProjectDialog()`, on
  selection calls `createWindowForProject(picked)` on the same
  window
- `welcome:open-recent` (path: string) → validates directory,
  opens or prunes stale entry via `removeFromRecent`
- `welcome:open-external` (url: string) — safe subset for License /
  Repo links (`shell.openExternal` with URL allowlist)
- `welcome:recent-updated` (main → renderer push) — sent when a
  stale entry is pruned so the visible list re-renders

### 6. `Menu > File > Open Folder…` behaviour is unchanged

Once a project is open, `Cmd/Ctrl+O` still fires the same
`pickProjectDialog() → switchProject()` path — the welcome view is
only for the "no project yet" state.

## Non-goals

- **Welcome page for subsequent launches with a valid saved
  project.** The "reopen last project" auto-launch stays; users who
  work in one project every day still see zero friction.
- **A `New Project…` button on the welcome page.** Per user
  direction: `Open Folder…` handles both cases (existing openspec
  folder OR fresh folder → the app's built-in `NoProjectDecisionPanel`
  decides after). A dedicated New Project entry can be added later
  if it becomes friction.
- **Web-side (browser mode) welcome UI.** This change is
  Electron-only. Browser-mode users already have a URL-based entry
  point; adding an in-app welcome view there is a separate concern.
- **Reading the app's stored `theme` preference for welcome.html.**
  The web app's theme is stored in localStorage under the
  `http://localhost:<port>` origin; welcome.html loads from
  `file://` and cannot read it. `prefers-color-scheme` is the
  correct signal for a fresh-user scenario (welcome only appears
  when no project is loaded).
- **A "Skip" / "Continue without a project" button.** The app
  requires a project to do anything meaningful; browsing without one
  is what `Open dashboard anyway` in `NoProjectDecisionPanel`
  already covers post-folder-selection.
- **Welcome view preference (do not show again)**. First-launch
  guard already exists via `store.getLastProject()`; a returning
  user with valid state never sees the welcome view. No preference
  toggle needed.

## Impact on existing capabilities

- **MODIFIED**: `Electron First-Launch Auto-Installs Agmsg`
  neighbourhood — the app's first-launch flow now loads welcome.html
  into the main window before the picker fires. Neither the agmsg
  install prompt nor the picker themselves change; only their entry
  point moves.
- **NEW** requirement: welcome view content + same-window swap
  contract.
- **NEW** requirement: About-config single-source-of-truth guarantee
  (welcome + native about panel MUST use the same `readAboutConfig()`
  output).
- The existing `pickProjectDialog()` and `createWindowForProject()`
  functions are reused; `createWindowForProject` gains a `null`
  parameter path but is signature-compatible with all existing
  callers (which always pass a string).
