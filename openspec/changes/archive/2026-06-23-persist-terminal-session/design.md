## Context

`add-embedded-terminal` introduced the Terminal component and docked it inside
ChangeDetail. The Terminal owns its WebSocket; on cleanup it calls `ws.close()`.
The server, in `ws.on("close", ...)`, calls `term.kill()`. So unmounting the
React component is equivalent to terminating the PTY. ChangeDetail unmounts on
every navigation away, and the Hide/Show toggle removes the Terminal from the
tree when hidden, so both gestures kill the shell. The `terminalVisible`
preference is already global in the Zustand store, so the only remaining issue
is *where* the Terminal mounts.

## Goals / Non-Goals

**Goals:**
- The PTY session survives client-side navigation between Overview, ChangeDetail,
  and Specs.
- The PTY session survives toggling Hide/Show — visibility is a CSS-only
  concern.
- Show the pane on any route, not just ChangeDetail, when it is visible.

**Non-Goals:**
- Server-side session persistence across hard page reload or server restart.
  (A reload tears down all WebSockets; we accept that boundary in v1.)
- Multiple terminal panes or tabs.
- Resizable splitter UI.

## Decisions

- **Mount once, in `App`.** Render `<Terminal />` at the App level inside a
  `<aside class="global-terminal">` so it lives for the lifetime of the
  dashboard. The component is rendered only when `terminalAvailable` is true
  (no point mounting if the backend has no PTY).
- **CSS visibility, not unmounting.** The `terminalVisible` flag toggles a class
  on the aside. Hidden state uses `display: none` so xterm.js stops rendering
  but the component and its WebSocket stay alive. (display:none rather than
  visibility:hidden because xterm's scrollback rendering is wasted work when not
  visible.)
- **ChangeDetail loses its inline Terminal.** Remove the `<Terminal />` import
  and the conditional split inside ChangeDetail; the page becomes a plain
  full-width detail view. The Hide/Show toggle continues to live in the
  ChangeDetail header for now because that is where users encounter it most;
  it flips the same global flag.
- **Global docked layout.** The Terminal pane is fixed to the right side of the
  viewport when visible, occupying a configurable width (CSS variable). The
  main content area's right padding adjusts so it does not slide under the
  terminal. This is a small layout shift the first time the terminal becomes
  visible.
- **One terminal everywhere.** The same PTY shows on Overview, ChangeDetail, and
  Specs alike. A user running `claude` keeps that session visible wherever they
  navigate.

## Risks / Trade-offs

- **Layout shift on first show.** When the terminal pane appears, the main
  content reflows. Acceptable — it's an explicit user gesture.
- **Always-running PTY.** With the singleton mount, the shell is alive whenever
  the dashboard is open and the terminal is visible. CPU cost is negligible
  for an idle shell, and the user can always Hide to stop xterm rendering
  (display:none), though the PTY stays alive.
- **Overview gains a terminal pane.** Visually different from before. The
  toggle still hides it, and the badge on the New Change button still shows
  the active command mode, so the UX is consistent.
- **CSS regressions.** The previous in-ChangeDetail split layout CSS becomes
  dead. We remove it to avoid carrying obsolete rules.
