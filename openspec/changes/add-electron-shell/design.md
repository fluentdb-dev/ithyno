## Context

Three distribution channels for one server:

```
                ┌────────────────────────────┐
                │ existing bin/openspec-ui.js │
                │ (server + React UI)         │
                └──┬──────────┬───────────┬──┘
                   │          │           │
              ┌────▼──┐ ┌─────▼───┐ ┌─────▼────┐
              │ CLI   │ │ VS Code │ │ Electron │
              │ + any │ │ webview │ │ Browser  │
              │ browser│ │ + delegated │ Window │
              │       │ │ terminal │ │ (this)   │
              └───────┘ └─────────┘ └──────────┘
```

The Electron column is the simplest: a BrowserWindow is a regular Chromium
context, so the existing UI works without any runtime branching. The only
genuinely-new code is the app shell that:

1. Picks a project folder.
2. Spawns the server in that folder.
3. Loads the launch URL (with the `add-csrf-protection` token) into a
   window.
4. Persists the user's project / window state for next launch.

## Goals / Non-Goals

**Goals:**
- Double-clickable desktop application on macOS, Windows, and Linux.
- Project picker on first launch; restore-last-project on subsequent
  launches.
- Recent-projects list in the native menu.
- The xterm.js embedded terminal continues to work (no delegation).
- Single-instance lock so the user gets one window per project.

**Non-Goals:**
- Auto-update (`electron-updater`). Listed for follow-up; v1 is "download
  the new bundle when there is one."
- Code signing / notarization. The build pipeline is unsigned; users
  bypass Gatekeeper or SmartScreen once. A signed build is a separate
  concern (cost: notarization keys + per-platform signing certificates).
- Native installers beyond what `electron-builder` ships out of the box.
- Multi-window / multi-project simultaneously. v1 is one window, one
  project, with an "Open Project" menu that switches.
- Replacing the localhost HTTP/WS layer with Electron IPC. The server
  runs in a child process and the BrowserWindow connects via localhost,
  same as the CLI. This keeps the contract identical across channels.

## Decisions

### App entry shape

```
electron/
├── package.json              # electron-builder config + scripts
├── tsconfig.json
└── src/
    ├── main.ts               # entry: app, window, lifecycle
    ├── server-spawner.ts     # spawn bin/openspec-ui.js, parse launch URL
    ├── project-store.ts      # userData state.json (last + recent)
    └── menu.ts               # native menu builder
```

`main.ts` is the only "live" file; the others are testable units.

### Server spawn

- Pick a free port using Node's `net.createServer().listen(0)` pattern.
- `spawn(node, [bin/openspec-ui.js], { env: { PORT, OPENSPEC_PROJECT_ROOT,
  OPENSPEC_OPEN: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })`.
- Read stdout until a line matches `/http:\/\/localhost:\d+\/\?token=[a-f0-9]+/`; that's the launch URL. Extract the token.
- Poll `GET /api/health` until 200 (50ms interval, 5s timeout) before
  loading the BrowserWindow.
- Forward server stdout/stderr to the Electron console for debugging
  (toggleable via `--verbose`).

### Project selection

- First launch (no `state.json`): show `dialog.showOpenDialog({
  properties: ['openDirectory'] })`. If the user cancels, quit cleanly.
- Subsequent launches: load `state.json`, restore `lastProject` if it
  still exists, otherwise show the picker.
- "File → Open Project…" rebuilds the server with the new folder. The
  cleanest implementation: tear down the existing server + window, spawn
  a new server for the new folder, open a new window. Single-window
  semantics.
- "File → Open Recent" submenu lists up to 10 entries; clicking switches
  via the same teardown path.
- "File → Close Project" quits the app (single-window semantics imply
  no-window = no-app).

### Window state

- Persist `width`, `height`, `x`, `y` on `close`.
- Default size: 1400×900.
- Restore-with-validation: if the saved position is off-screen (monitor
  removed), reset to default. Use
  `screen.getDisplayMatching({ x, y, width, height })` to check.

### Single instance

- `app.requestSingleInstanceLock()`. On second-instance event, focus the
  existing window. If a different folder was passed as argv, switch the
  project (same teardown path as the menu).

### Token handling

- The server prints `http://localhost:<port>/?token=<token>` to stdout
  (already, thanks to `add-csrf-protection`).
- `server-spawner.ts` parses that line and returns the URL.
- `BrowserWindow.loadURL(url)` consumes it. The web UI's
  `web/src/runtime.ts` does its usual bootstrap — reads `?token=`,
  stashes it, drops it from the visible URL.
- No tokens are written to disk by the shell.

### Menu structure

- macOS:
  - App menu: About, Quit
  - File: Open Project…, Open Recent → submenu, Close Project (quits)
  - Edit: Undo/Redo/Cut/Copy/Paste/Select All (standard role-based)
  - View: Reload, Toggle DevTools, Zoom controls
  - Window: Minimize, Close
  - Help: Documentation (opens docs/migration-guide.md in default
    browser, eventually a hosted docs site)
- Windows / Linux: same minus the macOS-specific App menu.

### Packaging

- `electron-builder` configuration lives in `electron/package.json`
  under `"build": { ... }`.
- Targets: `dmg` (macOS), `nsis` (Windows), `AppImage` (Linux).
- Bundled artifacts include the top-level `bin/`, `server/`,
  `web/dist/`, `templates/`, plus `electron/` and the necessary
  `node_modules`. `electron-builder` handles tree-shaking via the
  `files` glob.
- Result: ~150 MB DMG / installer; the bulk is the Electron runtime
  itself.

## Risks / Trade-offs

- **Bundle size.** Electron ships its own Chromium and Node, so the
  artifact is large. Acceptable for a dev tool; users used to other
  Electron apps will not be surprised.
- **Unsigned binaries.** macOS Gatekeeper and Windows SmartScreen will
  warn on first launch. We document the bypass; signed builds are
  separate work involving paid certificates.
- **Server state survives window close.** When the user quits, the
  server child is `SIGTERM`'d but may take a moment to exit. The app
  waits in `before-quit` for the process to die (up to 2 s) before
  exiting; if the timeout fires, we force-kill. Worst case: a stale
  process the user has to `kill` manually — acceptable and rare.
- **Folder switch via teardown.** Building a new server per project is
  simpler than keeping multiple servers alive. The user perceives a
  ~1 second "switching project" delay on Open Recent. Acceptable.
- **Auto-update absent.** Users will not be nagged to upgrade. For a
  tool this small and self-hosted in spirit, that's fine for v1.
- **Off-screen window restore.** Modern multi-monitor setups can leave
  saved positions on a no-longer-attached display. We validate against
  `screen.getDisplayMatching` and fall back to default.
- **Electron Node version vs system Node.** The server expects Node 18+
  features; Electron's bundled Node is current. We pin the Electron
  version in `electron/package.json` to make this explicit.
