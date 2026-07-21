# OpenSpec UI — Electron shell

Native desktop wrapper that hosts the existing OpenSpec UI dashboard in a
`BrowserWindow`. The server (`bin/openspec-ui.js`) runs as a child process
on a random free port; the window loads the launch URL (with the session
token from `add-csrf-protection`) once `/api/health` is green.

## Layout

```
electron/
├── package.json             # electron-builder config + scripts
├── tsconfig.json            # emits src/ → out/ (CommonJS)
└── src/
    ├── main.ts              # app lifecycle, window, single-instance lock
    ├── server-spawner.ts    # spawn bin/openspec-ui.js, parse launch URL, poll /api/health
    ├── project-store.ts     # userData/state.json (last + recent + windowState)
    └── menu.ts              # File → Open Project… / Open Recent, View, Window, Help
```

State lives at `app.getPath('userData')/state.json`:

```json
{
  "lastProject": "/absolute/path/to/project",
  "recent": ["/path/one", "/path/two"],
  "windowState": { "width": 1400, "height": 900, "x": 40, "y": 40 }
}
```

## Preload sandbox

The main `BrowserWindow` runs with `sandbox: true` in its `webPreferences`. In
this mode the preload script (`electron/src/preload.ts`) runs in a restricted
context that has **no access to Node.js APIs or Electron main-process modules**.
Importing `app`, `Menu`, `shell`, `dialog`, `BrowserWindow`, `ipcMain`,
`screen`, or any other main-process export — even transitively via a local
helper file — throws at runtime and silently kills the preload, causing
`window.openspecUI` to never be exposed.

`scripts/check-preload-imports.mjs` is a pre-`tsc` guard that walks
`preload.ts`'s full import graph and rejects anything outside the
preload-safe allowlist:

- **Allowed from `electron`**: only `contextBridge` and `ipcRenderer`.
- **Allowed relative imports** (`./foo`, `../bar`): recursed into; the
  resolved files are subject to the same allowlist.
- **Everything else** (bare modules like `node:fs`, `node:path`, third-party
  packages, any other `electron` named import): rejected with exit code 1.

The check runs before `tsc` in both `build` and `dev` scripts, so violations
surface at build time rather than as mysterious runtime failures.

### Adding a new IPC channel safely

Option A — inline the channel name constant directly in `preload.ts`:

```ts
const IPC_MY_EVENT = 'ithyno:my-event';
ipcRenderer.on(IPC_MY_EVENT, ...);
```

Option B — extract it into a preload-safe shared file that imports **only**
from `electron` (with `contextBridge`/`ipcRenderer` only, or nothing at all),
then import that file from `preload.ts`. The guard will walk it and pass.

Do **not** import the constant from a file that also imports `app`, `Menu`,
or any other main-process module — the transitive guard will reject it.

## Dev loop

Run from the repo root:

```bash
npm install              # installs Electron + electron-builder into electron/
npm run electron:dev     # tsc → out/, then electron .
```

First launch shows a folder picker. On subsequent launches the last
project is restored; the picker returns via **File → Open Project…** or a
recent entry from **File → Open Recent**.

Server stdout / stderr are forwarded to the Electron console — use it to
debug port collisions, missing `openspec/`, or PTY-backend failures.

## Packaging

`electron-builder` targets **dmg** (macOS), **nsis** (Windows), and
**AppImage** (Linux). Configuration lives in `electron/package.json` under
the `"build"` block; `extraResources` bundles the top-level `bin/`,
`server/`, `web/dist/`, `templates/`, and root `tsconfig.json` /
`package.json` under `Contents/Resources/app/`.

```bash
npm run electron:package:mac      # DMG (x64 + arm64)
npm run electron:package:win      # NSIS installer
npm run electron:package:linux    # AppImage
npm run electron:package:all      # all three (requires cross-toolchains)
```

### Side-loading (unsigned builds)

v1 does not code-sign or notarize; users see one OS-level warning on the
first launch and bypass it manually.

- **macOS**: `xattr -d com.apple.quarantine "OpenSpec UI.app"` or
  right-click → Open → Open Anyway.
- **Windows**: SmartScreen → *More info* → *Run anyway*.
- **Linux**: `chmod +x OpenSpec-UI-*.AppImage && ./OpenSpec-UI-*.AppImage`.

Signed builds require paid certificates (Apple Developer ID + notarization
credentials on macOS, an EV code-signing cert on Windows) — tracked as
follow-up work.

### Known packaging gap

The bundled `bin/openspec-ui.js` currently invokes `tsx` from the repo's
`node_modules/.bin/` to run the TypeScript server. That path exists in the
dev-mode worktree but is not part of `extraResources`, so the packaged app
starts the server via the same `tsx` binary only if the user's PATH
provides one (unlikely). Producing a self-contained artifact will need one
of:

- Pre-build `server/` to JavaScript via `npm run build:server` and ship
  `server-dist/` in place of `server/`, then teach the bin to prefer
  compiled JS when it exists.
- Or ship `node_modules/` in `extraResources` (rejected for size).

Tracked separately; today's Electron shell is developer-usable via
`npm run electron:dev`.
