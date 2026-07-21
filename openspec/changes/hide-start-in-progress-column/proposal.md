---
tags: [kanban, ui, dispatch, dashboard]
execution: worktree
---

## Why

The Kanban's IN-PROGRESS (and DONE) column headers currently render
the `Start ▼ (N)` bulk selector, inherited from the TODO column's
affordance. The selector's purpose is bulk-starting cards from TODO
into IN-PROGRESS — it has no meaning in a non-TODO column:

- **IN-PROGRESS `Start ▼ (N)`**: N is the count of already-started
  cards. Starting them again is either a no-op or a footgun
  (duplicate spawn attempt).
- **DONE `Start ▼ (N)`**: N is the count of finished cards.
  Restarting a done change is nonsense.

Removing the selector from non-TODO columns aligns the affordance
with its semantic (bulk transition TODO → IN-PROGRESS) and removes
the confusing `(N)` counter that duplicates the column-title count.

Explicitly out of scope:

- **Per-card `Start` button** — unchanged. Whatever gating exists
  today stays as-is.
- **Column-title card counts** — unchanged. Only the `Start ▼ (N)`
  selector goes.
- **Escalated-agent Resume/Retry** — a separate follow-up (idea
  captured 2026-07-21).

## What Changes

- **`web/src/components/Kanban.tsx`** (or the column-header
  component if extracted): render `Start ▼ (N)` **only** when the
  column is `TODO`. In IN-PROGRESS and DONE, render nothing in that
  slot.
- **Dashboard capability spec**: add a requirement locking the
  affordance to TODO.

## Success

- Kanban Overview: only the TODO column header shows `Start ▼ (N)`.
- IN-PROGRESS column header: no `Start ▼` control, no `(N)`
  counter next to it. Column title + card count (the existing
  column count, if any) remain.
- DONE column header: same — no `Start ▼` control.
- Per-card `Start` buttons: unchanged across all columns.
- Bulk-start from TODO continues to work as before.
- No new server error paths (nothing that could invoke duplicate
  start is added or removed).
