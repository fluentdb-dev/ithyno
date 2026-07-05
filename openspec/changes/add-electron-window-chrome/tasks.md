## 1. Electron main: window options

- [x] 1.1 `electron/src/main.ts::createWindowForProject` — add `titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden'`
- [x] 1.2 Add `backgroundColor: '#0f1115'` (dashboard's dark panel default; will be recolored dynamically once the theme change lands)
- [x] 1.3 On non-macOS, add `titleBarOverlay: { color: '#0f1115', symbolColor: '#e6e9ef', height: 32 }`
- [x] 1.4 Regression check: `whenReady`, `before-quit`, `window-all-closed`, single-instance handling all still work

## 2. Renderer safe area (macOS)

- [x] 2.1 Detect Electron macOS runtime and add a body class `is-electron-mac` (via `webPreferences` preload script or a small `runtime/electron.ts` check on `navigator.userAgent`)
- [x] 2.2 In `web/src/styles.css`, `.is-electron-mac header` receives `padding-top: 28px` so header content doesn't slide under the traffic lights
- [x] 2.3 Non-Electron and non-macOS Electron: no padding change

## 3. IPC: dynamic recolor

- [x] 3.1 New IPC channel name constant `IPC_SET_TITLE_BAR_COLOR = 'openspec-ui:set-title-bar-color'`
- [x] 3.2 Main handler: `ipcMain.handle(IPC_SET_TITLE_BAR_COLOR, (_, color: string, symbolColor: string) => { … })`; on macOS calls `window.setBackgroundColor(color)`; on Windows/Linux calls `window.setTitleBarOverlay({ color, symbolColor, height: 32 })`
- [x] 3.3 Preload exposes `window.openspecUI.setTitleBarColor(color, symbolColor)` on the renderer side (contextBridge)
- [x] 3.4 Guard: if the app is not running under Electron, the renderer's setter is a no-op

## 4. Renderer: theme sync (depends on `add-light-dark-mode`)

- [x] 4.1 In the theme-applied hook, whenever the resolved theme flips, call `window.openspecUI?.setTitleBarColor(bgVar, fgVar)` with the currently-computed `--bg-page` and `--fg-primary` values
- [x] 4.2 If `add-light-dark-mode` has not landed yet, this task can ship a static single call at first render (dark palette only) and be extended when theme support lands

## 5. Spec delta

- [x] 5.1 `openspec/changes/add-electron-window-chrome/specs/electron-shell/spec.md`: ADDED requirement covering the hidden / overlay title bar setup, background color, and the runtime-recolor IPC channel

## 6. Verification

- [x] 6.1 macOS: `npm run electron:dev` → no OS title bar visible, traffic lights on dark background, header content not clipped by traffic lights
- [ ] 6.2 macOS: package the DMG (per `add-electron-shell` follow-up) and confirm the same look on a fresh launch (window doesn't flash white)
- [ ] 6.3 Windows / Linux (opportunistic): title bar area painted `#0f1115` with white window controls; no default OS gradient bar
- [ ] 6.4 With `add-light-dark-mode` in place, flip the theme to Light → title bar area recolors to the light `--bg-page`
- [ ] 6.5 Without Electron (CLI + browser), no rendering regressions — the runtime detection stays false, no safe-area padding applied
