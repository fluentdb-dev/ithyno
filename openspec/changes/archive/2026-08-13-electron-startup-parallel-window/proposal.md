## Why

On Windows, the Electron app shows a blank screen for several seconds on launch because `BrowserWindow` is not created until `spawnServer()` fully completes (Node.js child process start + module load + health poll). Windows process-spawn and module-load overhead makes this gap significantly longer than on macOS.

## What Changes

- `BrowserWindow` is created immediately on launch (before `spawnServer` is called), showing `welcome.html` as an instant placeholder.
- When the server is ready, the window navigates from `welcome.html` to the server URL in-place — the same same-window swap already used for the welcome → project transition.
- This applies to the first-launch path (new `BrowserWindow` needed) and to the project-switch path where a new server must be spawned.
- A `[startup]` timing log is added to `spawnServer` and `createWindowForProject` to instrument each phase (pickFreePort / spawn / token / pollHealth / BrowserWindow / loadURL / ready-to-show) so startup bottlenecks can be measured on any platform.
- No change to the reuse-healthy-session fast path (window already exists, server already running).

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `electron-shell`: The requirement that the window only becomes visible after the server is ready changes — the window now appears immediately with `welcome.html`, then navigates to the server URL. Observable behavior change: users see the welcome page for the duration of server startup instead of a blank/hidden window.

## Impact

- `electron/src/main.ts`: `createWindowForProject` refactored to hoist `new BrowserWindow()` before `spawnServer`.
- `electron/src/server-spawner.ts`: `[startup]` timing logs added to `spawnServer`.
- No API, IPC, or server-side changes.
