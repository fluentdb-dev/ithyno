## 1. Workspace package scaffolding
- [ ] 1.1 Add `electron/` workspace to the root `package.json` (npm workspaces)
- [ ] 1.2 Create `electron/package.json` with electron-builder config and scripts (`electron:dev`, `electron:package`)
- [ ] 1.3 Add `electron/tsconfig.json` emitting to `out/`
- [ ] 1.4 Devdeps: `electron`, `electron-builder`, `@types/node`, `typescript`

## 2. Server spawner
- [ ] 2.1 `electron/src/server-spawner.ts` picks a free port via Node's net helpers
- [ ] 2.2 Spawn `bin/openspec-ui.js` with `OPENSPEC_PROJECT_ROOT`, `PORT`, `OPENSPEC_OPEN=0`, stdio piped
- [ ] 2.3 Parse the launch URL from stdout (regex `http://localhost:\d+/\?token=[a-f0-9]+`)
- [ ] 2.4 Poll `/api/health` until 200 (50ms intervals, 5s timeout)
- [ ] 2.5 Return `{ url, child }` to the caller

## 3. Project store
- [ ] 3.1 `electron/src/project-store.ts` reads / writes `state.json` under `app.getPath('userData')`
- [ ] 3.2 Track `lastProject` and `recent: string[]` (cap 10, MRU)
- [ ] 3.3 Track `windowState: { width, height, x?, y? }`

## 4. App entry
- [ ] 4.1 `electron/src/main.ts`: lifecycle (`whenReady`, `before-quit`, `window-all-closed`)
- [ ] 4.2 First-launch picker via `dialog.showOpenDialog({ properties: ['openDirectory'] })`
- [ ] 4.3 Subsequent launches restore `lastProject`; fall back to picker if path missing
- [ ] 4.4 `BrowserWindow` creation with saved size/position; validate against `screen.getDisplayMatching`
- [ ] 4.5 Load the launch URL after health succeeds
- [ ] 4.6 SIGTERM the server in `before-quit`; force-kill after 2s timeout

## 5. Single instance
- [ ] 5.1 `app.requestSingleInstanceLock()`; quit second instance
- [ ] 5.2 `second-instance` handler focuses the existing window
- [ ] 5.3 If the second instance carries a folder argv, switch project via the teardown path

## 6. Native menu
- [ ] 6.1 `electron/src/menu.ts` builds the Application menu (macOS App + File + Edit + View + Window + Help)
- [ ] 6.2 "File → Open Project…" invokes the folder dialog and switches project
- [ ] 6.3 "File → Open Recent" submenu built from the project store; entries switch via teardown
- [ ] 6.4 "Help → Documentation" opens `docs/migration-guide.md` (later: hosted docs URL)

## 7. Window state persistence
- [ ] 7.1 Save size + position on window `close`
- [ ] 7.2 Restore with display validation on next launch

## 8. Packaging
- [ ] 8.1 `electron-builder` config: targets `dmg`, `nsis`, `AppImage`
- [ ] 8.2 `files` includes the top-level `bin/`, `server/`, `web/dist/`, `templates/`, plus `electron/out/`
- [ ] 8.3 npm scripts: `electron:package:mac`, `:win`, `:linux`, `:all`

## 9. Docs
- [ ] 9.1 README: add the Electron channel to the install matrix
- [ ] 9.2 `docs/migration-guide.md`: list the Electron app as a Stage-2 alternative
- [ ] 9.3 `electron/README.md`: dev loop (`npm run electron:dev`), build, and side-loading notes

## 10. Verification
- [ ] 10.1 `npm run electron:dev` opens the app, prompts for a folder, and renders the kanban
- [ ] 10.2 Restart shows the same project without re-prompting
- [ ] 10.3 "File → Open Project…" switches to a different folder
- [ ] 10.4 "File → Open Recent" lists previous folders in MRU order
- [ ] 10.5 Closing the window quits the app and the server child exits
- [ ] 10.6 Double-launching focuses the existing window (single instance)
- [ ] 10.7 The packaged DMG runs the same flow end-to-end on macOS (analogous for Windows / Linux when CI is available)
