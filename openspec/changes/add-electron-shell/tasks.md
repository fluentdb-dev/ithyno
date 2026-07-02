## 1. Workspace package scaffolding
- [x] 1.1 Add `electron/` workspace to the root `package.json` (npm workspaces)
- [x] 1.2 Create `electron/package.json` with electron-builder config and scripts (`electron:dev`, `electron:package`)
- [x] 1.3 Add `electron/tsconfig.json` emitting to `out/`
- [x] 1.4 Devdeps: `electron`, `electron-builder`, `@types/node`, `typescript`

## 2. Server spawner
- [x] 2.1 `electron/src/server-spawner.ts` picks a free port via Node's net helpers
- [x] 2.2 Spawn `bin/openspec-ui.js` with `OPENSPEC_PROJECT_ROOT`, `PORT`, `OPENSPEC_OPEN=0`, stdio piped
- [x] 2.3 Parse the launch URL from stdout (regex `http://localhost:\d+/\?token=[a-f0-9]+`)
- [x] 2.4 Poll `/api/health` until 200 (50ms intervals, 5s timeout)
- [x] 2.5 Return `{ url, child }` to the caller

## 3. Project store
- [x] 3.1 `electron/src/project-store.ts` reads / writes `state.json` under `app.getPath('userData')`
- [x] 3.2 Track `lastProject` and `recent: string[]` (cap 10, MRU)
- [x] 3.3 Track `windowState: { width, height, x?, y? }`

## 4. App entry
- [x] 4.1 `electron/src/main.ts`: lifecycle (`whenReady`, `before-quit`, `window-all-closed`)
- [x] 4.2 First-launch picker via `dialog.showOpenDialog({ properties: ['openDirectory'] })`
- [x] 4.3 Subsequent launches restore `lastProject`; fall back to picker if path missing
- [x] 4.4 `BrowserWindow` creation with saved size/position; validate against `screen.getDisplayMatching`
- [x] 4.5 Load the launch URL after health succeeds
- [x] 4.6 SIGTERM the server in `before-quit`; force-kill after 2s timeout

## 5. Single instance
- [x] 5.1 `app.requestSingleInstanceLock()`; quit second instance
- [x] 5.2 `second-instance` handler focuses the existing window
- [x] 5.3 If the second instance carries a folder argv, switch project via the teardown path

## 6. Native menu
- [x] 6.1 `electron/src/menu.ts` builds the Application menu (macOS App + File + Edit + View + Window + Help)
- [x] 6.2 "File → Open Project…" invokes the folder dialog and switches project
- [x] 6.3 "File → Open Recent" submenu built from the project store; entries switch via teardown
- [x] 6.4 "Help → Documentation" opens `docs/migration-guide.md` (later: hosted docs URL)

## 7. Window state persistence
- [x] 7.1 Save size + position on window `close`
- [x] 7.2 Restore with display validation on next launch

## 8. Packaging
- [x] 8.1 `electron-builder` config: targets `dmg`, `nsis`, `AppImage`
- [x] 8.2 `files` includes the top-level `bin/`, `server/`, `web/dist/`, `templates/`, plus `electron/out/`
- [x] 8.3 npm scripts: `electron:package:mac`, `:win`, `:linux`, `:all`

## 9. Docs
- [x] 9.1 README: add the Electron channel to the install matrix
- [x] 9.2 `docs/migration-guide.md`: list the Electron app as a Stage-2 alternative
- [x] 9.3 `electron/README.md`: dev loop (`npm run electron:dev`), build, and side-loading notes

## 10. Verification
- [ ] 10.1 `npm run electron:dev` opens the app, prompts for a folder, and renders the kanban
- [ ] 10.2 Restart shows the same project without re-prompting
- [ ] 10.3 "File → Open Project…" switches to a different folder
- [ ] 10.4 "File → Open Recent" lists previous folders in MRU order
- [ ] 10.5 Closing the window quits the app and the server child exits
- [ ] 10.6 Double-launching focuses the existing window (single instance)
- [ ] 10.7 The packaged DMG runs the same flow end-to-end on macOS (analogous for Windows / Linux when CI is available)

> §10 items require a GUI session (macOS Finder / dock double-click) which the
> implementation environment cannot exercise. The server-spawner path was
> verified with a Node smoke script that spawned `bin/openspec-ui.js`, parsed
> the launch URL from stdout, and confirmed `/api/health` returned 200 on the
> free port. All other pieces are unit-shaped enough that typecheck +
> compilation gate them.
