# Outcome: sync-about-modal-across-surfaces

## ✅ What worked

- Exporting `IPC_OPEN_ABOUT` in `electron/src/menu.ts` and wiring `window.ithyno.onOpenAbout` in `electron/src/preload.ts` allowed `web/src/App.tsx` to mount `<AboutModal />` whenever the About menu item is clicked.
- Expanding `app.setAboutPanelOptions` in `electron/src/main.ts` ensures Electron's native system About dialog displays identical version, copyright, website, description, and author metadata.

## ⚠️ What surprised us

- Electron menu event handling works smoothly across both macOS App menu and Windows/Linux Help menu items by reusing the existing window handler pattern (`IPC_OPEN_ABOUT`).

## 🔁 What we'd do differently

- None; the solution seamlessly unifies the React `AboutModal` across topbar `?` clicks and native Electron OS menu triggers.

## 🌱 Follow-ups

- None required.
