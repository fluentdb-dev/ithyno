---
tags: [feature/init, area/electron]
---

# Electron: File → New Project menu (native dialog + direct runInit)

## Why

`add-init-http-endpoint` (2026-07-19 archived) landed the backbone: a
browser-visible New Project form in Settings backed by `POST /api/init`.
That flow works but relies on the user pasting an absolute path — the
browser can't open a native folder picker reliably.

Electron **can**. The main process already uses
`dialog.showOpenDialogSync` for File → Open Project…, and
`bin/init.js` exports `runInit` as a stateless async function. Following
the same pattern as `electron/src/agmsg-installer.ts` (main-process
direct file I/O with a native dialog), a File → New Project… menu item
can:

1. Ask the user to pick a folder using the native OS picker (macOS's
   Finder-style dialog surfaces a "New Folder" button when we set
   `properties: ['openDirectory', 'createDirectory']`, giving the user
   an immediate way to create the target).
2. Import `runInit` from `../bin/init.js` and call it with
   `autoCreateDir: true` and `autoGitInit: true` — no HTTP round-trip.
3. On success, hand off to the existing `switchProject` flow so the
   window re-loads pointed at the new project.

This does NOT depend on `POST /api/init`. The endpoint remains for the
browser-only channel and any future headless callers; Electron uses the
faster in-process path.

## What Changes

### 1. Menu: File → New Project…

Added to the File submenu immediately below "Open Project…" (a natural
sibling). Keyboard shortcut: `CmdOrCtrl+Shift+N` (mirrors "New Window"
conventions from most editors).

### 2. `pickNewProjectDialog(parent?)` main-process helper

Wraps `dialog.showOpenDialogSync` with:

```
{
  title: 'Select a folder for the new ithyno project',
  properties: ['openDirectory', 'createDirectory'],
  buttonLabel: 'Create ithyno project here',
}
```

Returns the absolute path or `null` when the user cancels.

### 3. `onNewProject` handler in `main.ts`

Wired into `buildAppMenu`'s handlers. Flow:

- `pickNewProjectDialog(mainWindow)` → target path (null → early exit).
- `import('../bin/init.js')` → `runInit({ targetDir, autoCreateDir: true,
  autoGitInit: true, quiet: true })`.
- On `res.ok: false` → `dialog.showErrorBox` with `res.reason`.
- On `res.ok: true` → toast-equivalent via `dialog.showMessageBox`
  (title: "Project ready", detail: openspecMissing-aware next steps),
  then `switchProject(res.target)`.

### 4. Menu handler type extension

`MenuHandlers` in `electron/src/menu.ts` gains `onNewProject(): void`.
`buildAppMenu` inserts the new item.

### 5. What this change does NOT touch

- **`POST /api/init` endpoint** — untouched. Browser flow keeps using it.
- **Renderer / web UI** — no changes. This is a main-process-only feature.
- **`agmsg-installer.ts`** — different domain; only used as a reference
  pattern (main-process file I/O + native dialog).
- **VS Code extension** — separate follow-up (`add-vscode-new-project-command`).
- **`openspec init` auto-chain** — same open question as before; deferred.

## Spec deltas (`electron-shell` capability)

- **ADDED** `New Project Menu` — File → New Project… item that opens the
  native picker, runs runInit directly, and switches the window to the
  new project.

## Impact

- **Affected specs**: `electron-shell` — 1 ADDED
- **Affected code**:
  - `electron/src/menu.ts`: extend `MenuHandlers`, insert menu item
  - `electron/src/main.ts`: `pickNewProjectDialog` + `onNewProject`
    handler + wire into `refreshMenu`
- **Risk**:
  - `showOpenDialogSync` is synchronous — briefly blocks the main
    process. Consistent with the existing Open Project… flow, so no new
    regression.
  - `runInit` runs synchronously (await) — for the small template set
    this is <200ms; no visible UI freeze.
  - `switchProject` implicitly tears down the current server. Same
    behavior as Open Project…; no new surface area.
- **Migration**: none.

## Related

- `openspec/changes/archive/2026-07-19-add-init-http-endpoint/` — the
  backbone this change complements.
- `docs/ideas/2026-07-19-init-from-ui.md` — full design conversation.
- `electron/src/agmsg-installer.ts` — the main-process direct-I/O
  pattern this proposal mirrors.
