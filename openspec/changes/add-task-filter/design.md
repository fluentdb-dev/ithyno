## Context

The Tasks view renders every section and task from the parsed tasks.md. There is
currently no way to narrow the list, which is painful for changes with many
completed tasks.

## Goals / Non-Goals

**Goals:**
- A toggle that hides checked tasks.
- Empty sections disappear while the filter is active.
- The choice persists per change across reloads.

**Non-Goals:**
- Full-text search or tag-based filtering.
- Server-side filtering.

## Decisions

- Keep filtering entirely client-side; the parsed model already has `checked`.
- Persist the per-change flag in `localStorage` keyed by change id.
- When filtering, drop sections whose visible task count is zero.

## Risks / Trade-offs

- A conflict re-confirmation banner on a hidden (completed) task could be missed;
  acceptable because conflicts target the task the user just acted on, which is
  not yet complete.
