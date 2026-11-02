# Outcome — add-tmux-session-browser-and-history

## ✅ Worked

- Added a project-scoped tmux session browser that exposes windows, panes,
  active state, pane geometry, and working directories without enumerating
  unrelated sessions.
- Window and pane selection reuses the existing Manager PTY and WebSocket, so
  switching targets does not restart the Manager or lose its conversation.
- Pane history supports bounded capture, refresh, search, selection, and copy
  without entering tmux copy mode or modifying terminal input.
- Capability detection keeps the terminal usable when tmux or psmux lacks
  selection or history commands.

## ⚠️ Surprises

- tmux reports one active pane per window. History selection therefore has to
  resolve the active window first and only then select that window's active
  pane.
- The original proposal mentioned job/role/Change association for panes, but
  no reliable association source exists yet. That item was removed from this
  change rather than shipping an inferred or incomplete mapping.

## 🔁 Differently next time

- Treat provider command discovery as shared runtime data from the beginning,
  so topology, UI availability, and action execution cannot drift.

## 📋 Verification

- Manual checks covered window and pane discovery, switching, retained history,
  refresh, search, copy, and preservation of the Manager session.
- The final repository suite passed with 1166 tests, 4 skipped, plus successful
  typecheck, production build, and strict OpenSpec validation.
