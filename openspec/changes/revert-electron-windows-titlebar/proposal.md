---
tags: [feature/revert, feature/electron, area/electron, area/web]
---

## Why

`add-electron-window-chrome` set `titleBarStyle: 'hidden'` +
`titleBarOverlay` on Windows and Linux to paint a custom dark bar
instead of the OS default, matching what it already did for macOS
(`hiddenInset`). This has a side effect on Windows/Linux that macOS
doesn't share: hiding the title bar also removes the row those
platforms reserve for the classic application menu (File / Edit /
View / Window / Help). `Menu.setApplicationMenu()` still builds and
registers the menu, but nothing on screen exposes it.

A fix was prototyped (`add-electron-windows-menu-button`, dropped —
see `docs/ideas/2026-07-22-windows-menu-bar-approach.md`): a
renderer-drawn hamburger button that pops up the existing native menu.
It worked, but on review the user wants Windows (and, for
consistency, Linux) to just look and behave like a normal desktop
app — native title bar, native menu bar, no substitute UI to relearn.

**Target**: `add-electron-window-chrome` — Case β (still in-flight,
unarchived; its `specs/electron-shell/spec.md` ADDED delta never
reached `openspec/specs/electron-shell/spec.md`).

This reverts only the Windows/Linux half of that change. The macOS
half (`hiddenInset`, dynamic background recolor via
`window.setBackgroundColor`) is untouched and still ships.

## What Changes

### Windows / Linux: back to the native frame

- Drop `titleBarStyle: 'hidden'` and `titleBarOverlay` on
  `process.platform !== 'darwin'` in `createWindowForProject`'s
  `BrowserWindow` options. No `titleBarStyle` override at all on
  these platforms → Electron's default native frame, native title
  bar, native File/Edit/View/Window/Help menu bar.
- `backgroundColor: '#0f1115'` (initial-paint flash prevention) is
  kept on all platforms — harmless and still useful with a native
  frame.
- The `openspec-ui:set-title-bar-color` IPC handler's
  `win.setTitleBarOverlay(...)` branch (Windows/Linux) is removed;
  only the macOS `win.setBackgroundColor(...)` branch remains. The
  renderer's `setTitleBarColor()` call becomes a harmless no-op on
  Windows/Linux (native frame ignores it).

### Renderer: no functional change required

- `.is-electron .topbar { -webkit-app-region: drag }` (added by
  `fix/windows-drag-and-pty`) is left in place. It's inert once the
  native frame returns — the topbar sits below the real OS title bar
  instead of inside an overlay, so the property has no effect, but
  removing it buys nothing and risks re-breaking the macOS case that
  shares the same rule.
- No renderer code changes needed beyond what's already shipped.

## Capabilities

### Modified Capabilities

- `electron-shell`: on Windows and Linux, the BrowserWindow uses the
  OS's default title bar and application menu again. macOS keeps the
  custom hidden-inset chrome from `add-electron-window-chrome`
  unchanged.

## Impact

- `electron/src/main.ts` — `createWindowForProject`'s `BrowserWindow`
  options (drop non-mac `titleBarStyle`/`titleBarOverlay`), the
  `openspec-ui:set-title-bar-color` IPC handler (drop the
  `setTitleBarOverlay` branch)
- `openspec/changes/add-electron-window-chrome/` — archived as part of
  this revert (Case β target); its `specs/` deleted (would collide
  with this revert's own ADDED baseline), `outcome.md` written noting
  the Windows/Linux portion was reverted

## Out of scope

- Any further change to macOS's window chrome.
- The dropped hamburger-menu-button prototype — captured in
  `docs/ideas/2026-07-22-windows-menu-bar-approach.md`, not
  resurrected here.
