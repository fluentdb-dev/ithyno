# Tasks

## 1. Electron IPC & Menu Wiring

- [x] 1.1 `electron/src/menu.ts` — export `IPC_OPEN_ABOUT = 'ithyno:open-about'` and send it to main window on About menu item click.
- [x] 1.2 `electron/src/main.ts` — update `app.setAboutPanelOptions` with complete metadata (website, comments, authors).
- [x] 1.3 `electron/src/preload.ts` — expose `window.ithyno.onOpenAbout`.

## 2. Web UI Wiring

- [x] 2.1 `web/src/App.tsx` — subscribe to `onOpenAbout` and open `<AboutModal />`.

## 3. Verification

- [x] 3.1 `npm run typecheck && npm test && npm run build` passes cleanly.
