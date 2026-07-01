## Why

The embedded terminal is mounted inside `ChangeDetail`, so any page navigation
or hide-toggle unmounts the `<Terminal />` component, closes its WebSocket, and
the server reacts by killing the PTY. The user loses their shell — including
in-flight Claude Code conversations, long-running commands, and scrollback —
just by clicking "Hide terminal" or by visiting Overview to peek at another
change. That is not the experience anyone expects from a docked terminal pane.

## What Changes

Lift the `<Terminal />` mount to the top-level `App` so it is mounted exactly
once when the server reports the terminal as available, and stays mounted for
the lifetime of the dashboard. Toggling visibility now uses CSS to hide/show
the pane instead of removing it from the tree, so the PTY session is never
torn down by a UI gesture. The terminal becomes a true singleton that survives
all client-side navigation.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `embedded-terminal`: the PTY session persists across page navigation and
  across hide/show toggles. Hiding the pane no longer destroys the session;
  navigating between changes preserves the same shell.

## Impact

- `web/src/App.tsx` mounts the Terminal as a docked singleton pane
- `web/src/pages/ChangeDetail.tsx` removes its inline Terminal mount; the
  Hide/Show button keeps working but now flips a global visibility flag (which
  it already does via the store)
- CSS layout updates for the global docked pane
- `web/src/components/Terminal.tsx` is unchanged — it already manages its own
  socket lifecycle correctly
- No server changes; no new dependencies
