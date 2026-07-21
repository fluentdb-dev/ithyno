# Tasks

## 1. Locate the column-header selector

- [x] 1.1 In `web/src/components/Kanban.tsx` (or a sibling if extracted), locate the JSX that renders the column-header `Start ▼ (N)` bulk selector. Note where the column identity is available (should be `column === "TODO"` / `"IN-PROGRESS"` / `"DONE"` or the phase enum used in the file).
- [x] 1.2 Confirm the same selector appears on IN-PROGRESS and DONE columns today (spot check the running dashboard). If DONE already omits it, that column-side work is a no-op — note in outcome.

## 2. Hide selector on non-TODO columns

- [x] 2.1 Guard the JSX so the `Start ▼ (N)` selector only renders when the column is `TODO`. In IN-PROGRESS and DONE, render nothing in that slot.
- [x] 2.2 Ensure the guard removes BOTH the dropdown/click affordance AND the `(N)` counter alongside it. Do not leave a dangling count in the header.
- [x] 2.3 Confirm the column-title + existing card-count (if any distinct badge) rendering is untouched — only the `Start ▼ (N)` selector goes.

## 3. Regression tests

- [x] 3.1 Extend `web/src/components/Kanban.test.ts`:
  - Render Kanban with mock changes distributed across TODO, IN-PROGRESS, DONE.
  - Assert `queryByText(/Start ▼/)` **inside** the IN-PROGRESS column header returns null.
  - Assert the same query inside the DONE column header returns null.
  - Assert the same query inside the TODO column header returns non-null.
  - Assert per-card `Start` buttons (queried by role) remain unaffected — count matches pre-change behavior across all columns.
- [x] 3.2 Run `npm test` — new assertions pass, existing tests unaffected.

## 4. Verification

- [x] 4.1 `npm run openspec -- validate hide-start-in-progress-column --strict` passes.
- [x] 4.2 `npm test` passes.
- [x] 4.3 `npm run typecheck` passes.
- [x] 4.4 `npm run build` passes.
- [ ] 4.5 Manual: `npm run dev` → open Kanban → TODO header shows `Start ▼ (N)`; IN-PROGRESS + DONE headers show no such selector, no `(N)` counter.
- [ ] 4.6 Manual regression: bulk-start from TODO — behavior unchanged.
- [ ] 4.7 Manual regression: per-card `Start` buttons visible where they were before this change (no accidental removal).
- [x] 4.8 Write `openspec/changes/hide-start-in-progress-column/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups: escalated-agent Resume/Retry affordance design (separate change).
