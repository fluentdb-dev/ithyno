# Outcome: electron-startup-parallel-window

## Worked

- **BrowserWindow creation hoisted before spawnServer**: window now appears in ~76 ms
  (packaged build) rather than after the full server startup (~3–4 s). The user sees
  the welcome.html placeholder immediately on launch.
- **Timing logs confirmed the bottleneck**: `spawnServer total` ~3.5–3.9 s in the
  packaged build (Node.js, no tsx overhead); `new BrowserWindow()` ~76–385 ms.
- **Same-window swap works correctly**: after the server is ready the window navigates
  in-place from welcome.html to `localhost:<port>/?token=…` with no flash or extra window.
- **launch-electron.mjs stdout fix**: piping `child.stdout/stderr` explicitly makes
  `[startup]` logs visible in the Windows terminal (GUI-subsystem exe doesn't forward
  via `stdio:"inherit"`).

## Surprises

- **Packaged path bugs exposed by the new flow**: the old `resolveWelcomeHtml` and
  `readAppIconDataUrl` functions used `join(process.resourcesPath, 'app', 'electron', …)`
  — a spurious `electron/` segment that was harmless when welcome.html was only loaded
  in dev mode but caused `ERR_FILE_NOT_FOUND` once it became the startup placeholder.
  Fixed by switching to `join(app.getAppPath(), …)` unconditionally.
- **Windows click-through double-spawn**: the newly visible window received an
  accidental `welcome:open-recent` IPC right after `ready-to-show` (mouse-button-up from
  the double-click that launched the exe fired on the first rendered button). Diagnosed
  via stack-trace logging; fixed by serialising all `createWindowForProject` calls through
  a `_cwfpQueue` promise queue.
- **VS Code holds app.asar during packaging**: VS Code file-watcher opened the newly
  created `app.asar` for indexing, preventing subsequent builds from replacing it.
  Mitigated by adding `.vscode/settings.json` with `files.watcherExclude` for
  `electron/dist/**`.
- **`npm run build` must precede `package:win`**: the `package:win` script does not
  recompile TypeScript; calling it with stale `out/main.js` silently ships old code.

## Differently

- Measure startup phases with timing logs BEFORE implementing the BrowserWindow hoist
  (the fix was implemented ahead of measurement, which required a retrofit).
- Add a pre-package step in `package:win` to always run `tsc` so the compiled output
  is never stale.

## Follow-ups

- Add `npm run build` as a prefix to `package:win` in `electron/package.json` so
  TypeScript is always recompiled before packaging.
- Investigate why `new BrowserWindow()` takes 76–956 ms in the packaged build (varies
  widely across runs); may be related to cold-start vs. warm VS Code cache.
- The queued second `createWindowForProject` call still starts a second server when the
  stored project path is stale (wrong path saved from an earlier test session). A
  pre-validation step that checks for `openspec/` before saving via `store.setProject`
  could prevent this.
