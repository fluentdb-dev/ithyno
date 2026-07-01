---
tags: [feature/electron, area/server, area/web]
---

## Why

The dashboard currently ships as a localhost CLI and (proposed)
`add-vscode-extension`. Both cover their respective audiences well — power
users on the command line and VS Code developers in the editor — but neither
serves users on **other editors** (Vim / Cursor / JetBrains / Sublime / no
editor at all). A standalone desktop application closes that gap with a
single double-clickable bundle, no separate runtime, no command-line
gymnastics.

Architecturally this is the **smallest of the three packagings**: Electron
just hosts our existing React UI in a BrowserWindow pointed at a localhost
server we spawn at app startup. None of the runtime branching the VS Code
extension needed (terminal delegation, `postMessage` injection) applies here
— the BrowserWindow is a real browser and the embedded xterm.js terminal
works as-is.

This change was previously **parked** in favor of the VS Code extension; we
land it now because (a) `add-csrf-protection` already gave us the token-URL
mechanism every shell needs, and (b) the marginal effort is small once the
server's request-authentication is in place.

## What Changes

Add a new `electron/` workspace package that wraps the existing dashboard:

- **App entry** (`electron/src/main.ts`): on `app.whenReady`, opens a
  project picker (or reuses the last project), spawns
  `bin/openspec-ui.js` as a child process with a random port and
  `OPENSPEC_OPEN=0`, parses the launch URL from stdout (it contains the
  session token courtesy of `add-csrf-protection`), waits for
  `/api/health`, and creates a `BrowserWindow` loading the URL.
- **Project picker + recent list**: stored in `app.getPath('userData')/state.json`. First-launch dialog asks for a folder; subsequent launches restore the
  last project but expose **File → Open Project…** and **File → Open
  Recent** in the native menu.
- **Single-instance lock** so a second double-click focuses the existing
  window instead of spawning a parallel server.
- **Window state persistence** (size + position) across launches.
- **Native menu**: minimal (`File`, `View`, `Window`, `Help`) — the React
  UI carries the application chrome.
- **Packaging via `electron-builder`** with DMG / NSIS / AppImage
  targets. Code signing is documented but not required for v1; the
  unsigned artifacts work for personal use after Gatekeeper / SmartScreen
  bypass.

The existing CLI and the upcoming VS Code extension are unchanged.

## Capabilities

### New Capabilities
- `electron-shell`: Electron app lifecycle that spawns the dashboard
  server on a random free port, parses the session token from the launch
  URL, opens a BrowserWindow pointing at it, and manages project
  selection across launches

### Modified Capabilities
<!-- none -->

## Impact

- New `electron/` npm workspace with its own `package.json`, `tsconfig`,
  `src/main.ts`, `src/server-spawner.ts`, `src/project-store.ts`,
  `src/menu.ts`
- Devdeps in `electron/`: `electron`, `electron-builder`, `@types/node`,
  `typescript`
- New top-level npm scripts: `electron:dev`, `electron:package` (per OS)
- README updated to list Electron alongside CLI and VS Code as
  distribution channels
- `docs/migration-guide.md` updated with a third stage-2 install path:
  "download the Electron app"
- No web UI changes (BrowserWindow is a real browser; everything works)
- No server changes (the same `bin/openspec-ui.js` is spawned)
