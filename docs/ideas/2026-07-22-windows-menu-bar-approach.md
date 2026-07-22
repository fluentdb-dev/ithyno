---
status: dropped
tags: [feature/electron, area/electron]
source: conversation
related: []
promoted_to: null
---

# Windows/Linux menu-bar access: hamburger popup vs. native title bar

`add-electron-window-chrome` hid the OS title bar on Windows/Linux via
`titleBarStyle: 'hidden'` + `titleBarOverlay`. Side effect: the classic
File/Edit/View/Window/Help application menu bar disappears on those
platforms too (confirmed via Electron's own custom-title-bar docs) —
`Menu.setApplicationMenu()` still builds the menu but there's no
visible/discoverable way to reach it. macOS is unaffected since its
menu bar is a screen-level OS fixture, independent of the window's
title bar.

Two directions were considered:

1. **Hamburger button in the custom topbar** that calls
   `Menu.popup()` on the already-built native menu (no items
   reimplemented). Prototyped as `add-electron-windows-menu-button`
   — main-process IPC handler, preload bridge, renderer button, CSS —
   all implemented and confirmed working via a live screenshot.
2. **Revert to the native OS title bar + menu bar on Windows/Linux**,
   keeping only macOS's `hiddenInset` custom chrome. Simpler, matches
   what users actually expect from a "normal Windows app," sacrifices
   the "seamless dark bar" look on non-mac platforms.

Direction 1 was fully implemented and visually verified working, but
the user rejected it after seeing it — they explicitly wanted the
standard native Windows bar (menu included), not a custom substitute.
The implementation was discarded (never committed) and
`add-electron-windows-menu-button` was dropped without archiving.

Promoted to `revert-electron-windows-titlebar`, which reverts the
Windows/Linux portion of `add-electron-window-chrome` (Case β — that
change was still in-flight, unarchived, when the revert landed).
