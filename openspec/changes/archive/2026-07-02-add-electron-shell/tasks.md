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
- [x] 10.1 `npm run electron:dev` opens the app, prompts for a folder, and renders the kanban
- [x] 10.2 Restart shows the same project without re-prompting
- [x] 10.3 "File → Open Project…" switches to a different folder
- [x] 10.4 "File → Open Recent" lists previous folders in MRU order
- [x] 10.5 Closing the window quits the app and the server child exits
- [ ] 10.6 Double-launching focuses the existing window (single instance) — dev-mode `electron .` sends `.` as argv → resolves to workspace dir (not the target project) → path-normalization fix landed (setProject absolute + workingDirectory-based resolve + currentProjectRoot compare) but the dev artifact where `.` corrupts state remains; full verification is packaged-only
- [ ] 10.7 The packaged DMG runs the same flow end-to-end on macOS (analogous for Windows / Linux when CI is available)

> §10.1–10.5 verified manually post-merge via `npm run electron:dev` against
> this repository. §10.6 revealed a real bug in the second-instance argv
> handling (see follow-up commit before archive: absolute-path normalization
> in `ProjectStore.setProject` + `workingDirectory`-based resolve in
> `main.ts`'s `second-instance` handler). Full 10.6 pass is deferred to the
> packaged build — a shipped DMG's second-instance argv doesn't include a
> stray `.`, so the bug can't reproduce there. §10.7 blocks on
> `add-electron-packaging-self-contained` (already listed in outcome
> Follow-ups).
