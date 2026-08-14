## 1. Timing Instrumentation

- [x] 1.1 Add `[startup]` timing logs to `spawnServer` in `electron/src/server-spawner.ts`: pickFreePort, spawn() call, token received, pollHealth, total
- [x] 1.2 Add `[startup]` timing logs to `createWindowForProject` in `electron/src/main.ts`: function start, spawnServer total (caller side), new BrowserWindow(), loadURL/loadFile, ready-to-show total

## 2. Parallel Window Creation

- [x] 2.1 Hoist `new BrowserWindow()` creation (with all event handlers) to before `spawnServer()` in `createWindowForProject`
- [x] 2.2 Load `welcome.html` on the newly created window immediately (before server is ready) so the user sees a window during server startup
- [x] 2.3 After `spawnServer()` resolves, call `mainWindow.loadURL(spawn.url)` to navigate in-place — reuse existing same-window swap pattern
- [x] 2.4 Ensure the existing `mainWindow` reuse path (window already exists) still works correctly for project switches

## 3. Validation

- [x] 3.1 `npm run typecheck` passes in the `electron/` workspace
- [x] 3.2 Manual smoke test on Windows: window appears within ~300 ms of launch (welcome page visible while server starts), then navigates to app
- [x] 3.3 Manual smoke test: "File → Open Project…" still works (teardown → spawn → navigate)
- [x] 3.4 Manual smoke test: healthy-session reuse path unchanged (no welcome flash on reload)
