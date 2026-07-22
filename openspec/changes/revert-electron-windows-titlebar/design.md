## Context

`add-electron-window-chrome` applied the same "hide the OS title bar,
paint our own dark surface" treatment to macOS (`hiddenInset`) and
Windows/Linux (`hidden` + `titleBarOverlay`). On Windows/Linux this
had an unintended consequence the change's own "Out of scope" section
didn't anticipate: hiding the title bar also hides the classic
application menu bar, since (unlike macOS) Windows/Linux don't have a
screen-level global menu — the menu bar lives inside the window's
title-bar row. `Menu.setApplicationMenu()` keeps working at the API
level, but there is no UI left to trigger it from.

A fix (renderer-drawn button that pops the existing native `Menu`) was
built and confirmed working, but rejected on review: the user wants
Windows to behave like an ordinary Windows app, full stop — native
title bar, native menu bar, nothing bespoke.

## Goals / Non-Goals

**Goals:**
- Windows and Linux: native OS title bar + native application menu,
  indistinguishable from an app that never touched `titleBarStyle`.
- macOS: zero change — keep `hiddenInset` + dynamic recolor.
- Keep the revert small and mechanical — this is undoing a scoped
  part of a prior change, not a redesign.

**Non-Goals:**
- Redesigning macOS chrome.
- Re-attempting any Windows/Linux "custom look" — see
  `docs/ideas/2026-07-22-windows-menu-bar-approach.md` for why the
  hamburger-popup alternative was tried and dropped.

## Decisions

### Scope: Windows AND Linux, not Windows-only

Both platforms hit the identical menu-bar-disappears failure mode
(confirmed via Electron's own custom-title-bar documentation, which
describes the Windows/Linux behavior as a pair, distinct from macOS).
Reverting only Windows would leave the same latent bug on Linux,
undiscovered until someone runs it there. No reason to special-case
them differently.

### Case β target: `add-electron-window-chrome`

That change is still in-flight — its `specs/electron-shell/spec.md`
ADDED delta never reached `openspec/specs/electron-shell/spec.md`.
Per the project's revert workflow, a Case β target gets its `specs/`
deleted (would otherwise double-apply against this revert's own
ADDED baseline) and is archived alongside the revert, with an
`outcome.md` documenting what was actually built and why the
Windows/Linux half didn't survive.

### What stays from the original change

The macOS-specific work (`hiddenInset`, 28px traffic-light padding,
dynamic `setBackgroundColor` via the `openspec-ui:set-title-bar-color`
IPC channel) is untouched — it has no menu-bar side effect and nobody
asked for it to change.

The `.is-electron .topbar { -webkit-app-region: drag }` CSS rule
(added later, in `fix/windows-drag-and-pty`, to fix dragging under the
Windows overlay) is left in place rather than re-scoped back to
`.is-electron-mac`. It's dead weight on Windows/Linux now (no overlay
to drag within) but harmless, and re-scoping it risks a regression on
the macOS path that still needs it. Simplicity over cleanup here.

## Alternatives considered

- **Keep the hamburger-menu-button fix** (`add-electron-windows-menu-button`).
  Rejected by the user after a live demo — see the idea note.
- **Windows-only revert, leave Linux on the overlay.** Rejected: same
  bug, same fix, no reason to diverge; Linux users would hit the
  identical menu-bar loss.
- **Keep `titleBarOverlay` but also re-add a visible menu bar row via
  `win.setMenuBarVisibility(true)` with `autoHideMenuBar: false`.**
  Not viable — once `titleBarStyle: 'hidden'` removes the title-bar
  row, there is no space left for Electron to draw the classic menu
  bar into; `setMenuBarVisibility` does not resurrect it. Confirmed
  by Electron's own docs recommending either a custom in-app menu
  (the rejected hamburger approach) or dropping the custom title bar
  entirely (this revert).
