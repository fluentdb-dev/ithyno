---
tags: [feature/ui, screen/kanban, area/web]
---

## Why

The CommandModal previews the exact string that Send would inject
into the embedded terminal — `/opsx:apply <id>`, `/ithy-opsx:archive
<id>`, `git merge --no-ff agent/<id>`, etc. Users regularly want to
copy that string:

- To paste into a separate terminal session (e.g. a real login
  shell, not the dashboard's embedded one)
- To document what happened in an outcome / commit / PR description
- To hand off to a teammate who's not sharing this browser session

Today the copy path is "select the text with the mouse, Cmd+C" —
awkward inside a modal with a small preview area, and it's easy to
grab surrounding whitespace or the syntax-highlighting artifacts.

## What Changes

- **Copy button** rendered in the top-right corner of the
  CommandModal's preview area.
- **Icon-only** with an `aria-label="Copy command"` and a title
  tooltip; visual is a clipboard glyph (SVG inline, no icon-font
  dependency).
- **Click behavior:** call `navigator.clipboard.writeText(command)`
  with the current preview text (i.e. the result of `build(_, mode)`
  at click time — includes mode-aware substitution for
  archive / merge).
- **Feedback:** on success, swap the icon to a check for ~1.2s, then
  revert. On rejection (clipboard permission denied), pop a toast
  ("Copy failed — clipboard permission not granted").
- **Keyboard:** `Cmd+C` while the modal is open and no text is
  selected copies the preview.

## Capabilities

### Modified Capabilities

- `dashboard`: the CommandModal exposes an explicit Copy action for
  the preview string, in addition to the existing Send.

## Impact

- `web/src/components/CommandModal.tsx` — copy button + icon swap
  state + Cmd+C listener
- Small CSS for button position

## Out of scope

- **Copying inside the embedded terminal itself.** Xterm already
  supports Cmd+C / right-click; the modal is a separate surface.
- **Copy-with-newline vs. copy-verbatim toggle.** Preview strings
  are single-line; not needed.
- **Copy history / clipboard manager**. Distinct feature.
- **Copy button on the Kanban card itself** (e.g. copy change id
  directly). Nice, but different UX; separate proposal if wanted.
