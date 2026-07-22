# Outcome: add-electron-window-chrome (partially reverted)

## ✅ What worked

- macOS: `titleBarStyle: 'hiddenInset'` + `backgroundColor` gave a
  clean, seamless dark bar on the first try. The 28px safe-area
  padding under `.is-electron-mac` kept header content clear of the
  traffic lights with no fiddling.
- The dynamic recolor IPC (`openspec-ui:set-title-bar-color`) worked
  cleanly for macOS's `window.setBackgroundColor()` path once
  `add-light-dark-mode` landed — theme flips repainted the title-bar
  surface within a frame, as designed.
- The Windows/Linux `titleBarOverlay` approach itself rendered
  correctly (dark surface, native-drawn min/max/close buttons in the
  right color) — the visual half of the Windows/Linux work was fine.

## ⚠️ What surprised us

- **`-webkit-app-region: drag` was only wired for macOS** in the
  original implementation (task 2a wasn't in the initial task list —
  it was added later, in `fix/windows-drag-and-pty`, after a Windows
  tester reported the topbar wasn't draggable at all). Hiding the
  title bar removes the native drag region on every platform, not
  just macOS; this should have been in scope from the start.
- **Hiding the title bar on Windows/Linux also hides the classic
  application menu bar** (File/Edit/View/Window/Help). This wasn't
  anticipated in the original proposal's "Out of scope" section,
  which assumed `titleBarOverlay` alone was "enough for v1" — it
  covers window control buttons, not menu-bar reachability.
  `Menu.setApplicationMenu()` kept building the menu, but there was no
  UI left to trigger it from on Windows/Linux (macOS is unaffected —
  its menu bar is an OS-level fixture, independent of any window's
  title bar).
- A hamburger-button fix that popped the existing native `Menu` was
  fully built and confirmed working (see
  `docs/ideas/2026-07-22-windows-menu-bar-approach.md`), but was
  rejected on review — the expectation was a fully native Windows
  experience, not a bespoke substitute.

## 🔁 / 🌱

**Reverted (Windows/Linux portion only) by
[revert-electron-windows-titlebar](../archive/2026-07-22-revert-electron-windows-titlebar/).**
The macOS chrome (`hiddenInset`, dynamic recolor) is unaffected and
ships as originally designed.
