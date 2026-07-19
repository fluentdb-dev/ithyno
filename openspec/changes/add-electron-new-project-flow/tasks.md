# Tasks — add-electron-new-project-flow

## 1. Spec delta

- [x] 1.1 Write ADDED `New Project Menu` under `electron-shell`

## 2. menu.ts

- [x] 2.1 Extend `MenuHandlers` interface with `onNewProject(): void`
- [x] 2.2 Insert "New Project…" menu item under File submenu, right
  after "Open Project…", with `CmdOrCtrl+Shift+N` accelerator

## 3. main.ts

- [x] 3.1 Add `pickNewProjectDialog(parent?)` — `showOpenDialogSync`
  with `properties: ['openDirectory', 'createDirectory']`
- [x] 3.2 Add `onNewProject` handler — pick → import runInit → run →
  handle result
- [x] 3.3 Success: `dialog.showMessageBox` with next-steps detail,
  then `switchProject(target)`
- [x] 3.4 Failure: `dialog.showErrorBox` with the runInit reason
- [x] 3.5 Cancel (null pick): early exit, no error dialog
- [x] 3.6 Wire `onNewProject` into `refreshMenu`'s handler bag

## 4. Verify

- [x] 4.1 `openspec validate add-electron-new-project-flow --strict` VALID
- [x] 4.2 `npm test && npm run typecheck && npm run build` clean
- [x] 4.3 `npm --workspace=electron run build` clean (electron TS compile)
- [ ] 4.4 Manual (dev): launch Electron via `npm --workspace=electron run
  start`, click File → New Project…, pick a fresh path via the OS
  dialog, confirm success dialog + window navigates to new project
  — **deferred** (VSCode terminal cannot drive interactive Electron
  dialogs; noted in outcome as pending user-side smoke test)
- [ ] 4.5 Manual: pick an existing populated non-git dir — expect
  success (autoGitInit handles it) OR clear error dialog if runInit
  fails for another reason — **deferred** (same as 4.4)

## 5. Post-impl

- [x] 5.1 `outcome.md`
- [x] 5.2 Update `docs/ideas/2026-07-19-init-from-ui.md` frontmatter:
  extend `promoted_to` with this change's archive path
- [ ] 5.3 `/ithy-opsx:archive add-electron-new-project-flow`
