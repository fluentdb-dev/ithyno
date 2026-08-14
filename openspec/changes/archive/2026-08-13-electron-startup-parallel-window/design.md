## Context

`createWindowForProject` currently calls `spawnServer()` first and awaits it fully (port allocation → child spawn → module load → token output → health poll), then creates the `BrowserWindow` and calls `loadURL`. On Windows, the module-load phase alone takes 2–5 s, during which the user sees nothing.

The same-window swap pattern (welcome.html → server URL in the same `BrowserWindow`) already exists for the "no saved project" path. The optimization is to extend that pattern to the "has saved project" path: show welcome immediately, navigate when the server is ready.

## Goals / Non-Goals

**Goals:**
- Reduce perceived startup time: show a visible window within ~300 ms of launch.
- Measure each startup phase with `[startup]` log lines so regressions are detectable.
- Keep the healthy-session reuse path unchanged (already fast — no new `BrowserWindow` needed).

**Non-Goals:**
- Reducing actual server startup time (separate concern; would require lazy loading or preforking).
- Showing real progress (spinner, percentage) during server startup — welcome.html as placeholder is sufficient.
- Changing startup behavior on macOS / Linux (the fix helps there too, but it is not the driver).

## Decisions

**D1 — Hoist `new BrowserWindow()` before `spawnServer()`**

Create the window immediately and load `welcome.html` on it. When `spawnServer` resolves, call `mainWindow.loadURL(spawn.url)` to navigate. This reuses the existing same-window swap infrastructure with no new IPC or preload changes.

The window has `show: false` + `ready-to-show` → `show()`. Because `welcome.html` is a local file it loads in ~100–200 ms, so `ready-to-show` fires almost immediately. The user sees the welcome page while the server starts.

**D2 — Keep `spawnServer` awaited (no fire-and-forget)**

`spawnServer` is still `await`ed inside `createWindowForProject`. Error handling (retry dialog, quit) stays intact. The only structural change is that the window exists before the await, not after.

**D3 — Timing logs as `console.log` (not `performance.mark`)**

`[startup] phase: Xms` lines to stdout are sufficient for diagnosis. They are visible in the terminal where `npm start` / `electron .` is run and in the Electron main-process DevTools console. No dependency on the `performance` API.

## Risks / Trade-offs

- **Brief welcome flash on project open**: When a saved project is opened, the user sees welcome.html for the duration of server startup. This is a visible change from the current blank-then-loaded behavior. The trade-off is intentional — a visible placeholder is better than a blank/hidden window.
- **Navigation jank**: `loadURL` navigating away from `welcome.html` while it is still rendering is safe; Electron handles in-flight navigation correctly.
- **Error dialog timing**: If `spawnServer` fails, the error dialog now appears over a visible window rather than before any window shows — this is strictly better UX.
