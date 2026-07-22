## 1. Main process: drop Windows/Linux custom chrome

- [x] 1.1 `electron/src/main.ts::createWindowForProject` — remove the `titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden'` conditional; only set `titleBarStyle: 'hiddenInset'` when `process.platform === 'darwin'`, omit the property entirely otherwise
- [x] 1.2 Remove the non-mac `titleBarOverlay` block (the `...(process.platform === 'darwin' ? {} : { titleBarOverlay: {...} })` spread)
- [x] 1.3 Keep `backgroundColor: DEFAULT_CHROME_COLOR` on all platforms (initial-paint flash prevention, harmless with a native frame)
- [x] 1.4 In the `openspec-ui:set-title-bar-color` IPC handler, remove the `else if (typeof symbolColor === 'string') { win.setTitleBarOverlay(...) }` branch — only the macOS `win.setBackgroundColor(color)` branch remains
- [x] 1.5 `OVERLAY_HEIGHT` / `DEFAULT_CHROME_SYMBOL` constants: not referenced elsewhere — removed as dead code

## 2. Verification

- [x] 2.1 Windows: `npm run electron:dev` → native OS title bar + File/Edit/View/Window/Help menu bar visible; window drag/minimize/maximize/close all native (no custom overlay) — confirmed via screenshot
- [ ] 2.2 Windows: File → Open Project…, Open Recent, New Project…, Close Project, View → Reload Terminal all work exactly as they did before `add-electron-window-chrome` (visual confirmation only so far; menu items not individually clicked)
- [ ] 2.3 macOS: `npm run electron:dev` → unchanged — hidden inset title bar, traffic lights, dark background, theme-flip recolor via IPC all still work (cannot verify on this Windows machine)
- [x] 2.4 `npm test && npm run typecheck && npm run build` — 339 passed, typecheck clean, build clean

## 3. Archive the reverted target (`add-electron-window-chrome`, Case β)

- [x] 3.1 Delete `openspec/changes/add-electron-window-chrome/specs/` (its ADDED delta would collide with this revert's own ADDED baseline in `electron-shell`)
- [x] 3.2 Write `openspec/changes/add-electron-window-chrome/outcome.md` — preserve `## ✅ Worked` / `## ⚠️ Surprises` describing what was actually built (macOS chrome, dynamic IPC recolor, the Windows/Linux overlay attempt and its menu-bar side effect), replace `## 🔁 Differently` / `## 🌱 Follow-ups` with a pointer to this revert
- [x] 3.3 `npm run openspec -- archive add-electron-window-chrome --yes` → archived as `2026-07-22-add-electron-window-chrome`
- [ ] 3.4 Commit: `archive: add-electron-window-chrome (reverted)`
- [ ] 3.5 Archive this revert change itself last, so the archive tree reflects the revert as the terminal state
