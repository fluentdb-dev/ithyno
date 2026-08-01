# Proposal: Sync About Modal Across Surfaces

## Why

The topbar `?` button opens a rich `AboutModal` containing full app metadata (name, version, license, product description, repository link, issues link, sponsors, update check, and view license). Invoking "About ithyno" from the OS App Menu / Help Menu in Electron currently opens Electron's native minimal about dialog.

Syncing the About modal across menu triggers and the header `?` button ensures users receive identical, comprehensive product details regardless of how "About" is invoked.

## What Changes

- Export `IPC_OPEN_ABOUT` in `electron/src/menu.ts` and dispatch it to the main window on About menu item click.
- Populate `app.setAboutPanelOptions` in `electron/src/main.ts` with full metadata (applicationName, applicationVersion, version, copyright, website, comments, authors).
- Expose `onOpenAbout` in `electron/src/preload.ts` under `window.ithyno`.
- Wire `web/src/App.tsx` to subscribe to `onOpenAbout` and open `<AboutModal />`.

## Capabilities

- Modified: `dashboard`

## Impact

- `electron/src/menu.ts`, `electron/src/main.ts`, `electron/src/preload.ts`
- `web/src/App.tsx`, `web/src/components/AboutModal.tsx`
