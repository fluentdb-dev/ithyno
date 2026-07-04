---
tags: [feature/kanban, screen/overview, area/web]
---

## Why

The Kanban board grows to dozens of active changes during a
dogfooding session (this repo currently has ~15 in-flight in a single
column). Locating a specific change requires visual scanning, and
there's no keyboard shortcut for "jump to a change." Users hit
Ctrl+F expecting a filter and get the browser's find-in-page, which
searches the DOM but doesn't hide non-matching cards.

The change list is already client-side state; adding a filter is
purely a render-time decision over `state.changes`.

## What Changes

- **Filter input** in the Overview header (above the three columns).
  Small text field, placeholder "Filter changes…" (or `⌘F` /
  `Ctrl+F` hint).
- **Keyboard shortcut:** `Cmd+F` (macOS) / `Ctrl+F` (Windows/Linux)
  captured on the Overview page focuses the filter input. The
  browser's built-in find-in-page is preempted only while the
  Overview is active and the filter is not already focused
  (`preventDefault` on the keydown).
- **Filter logic.** Case-insensitive substring match against:
  - `change.id`
  - `change.proposal?.title` if present
  - `change.proposal?.tags?.map(t => t.name).join(" ")`
- **Filter behavior across columns.** Cards not matching are
  removed from view; column totals shown in the header shrink
  accordingly. Empty columns still render (as "0 items") so users
  can see nothing matched.
- **Persistence.** Filter is session-only (in-memory zustand
  slice), NOT persisted to localStorage. A stale filter across
  reloads is a bigger footgun than losing the filter on refresh.
- **Escape clears.** `Esc` while the input is focused clears the
  filter and blurs.

## Capabilities

### Modified Capabilities

- `dashboard`: the Overview Kanban gains a filter input with
  `Cmd+F` / `Ctrl+F` shortcut and Esc-to-clear.

## Impact

- `web/src/pages/Overview.tsx` (or wherever the Kanban is rendered) — filter input, keydown listener, filter state
- `web/src/store.ts` — optional: hoist filter to store if multiple views need it, otherwise local state is fine
- Small CSS for the input positioning

## Out of scope

- **Multi-facet filter** (by tag, by execution mode, by agent
  status). Nice-to-have follow-up; the single-input substring
  filter covers 90% of use.
- **Persisting the filter across reloads.** Deliberately excluded
  — stale filters cause "why can't I see my change?" confusion.
- **Highlighting matched substrings within cards.** Small win,
  large fiddly rendering change; deferred.
- **Filter on the Agents page.** Different UX (chronological job
  list vs. board). Separate follow-up if needed.
