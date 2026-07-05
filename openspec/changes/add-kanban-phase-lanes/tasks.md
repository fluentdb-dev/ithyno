## 1. Bucketing

- [ ] 1.1 Introduce `LaneId = Phase | "unphased"` in `web/src/components/Kanban.tsx`; remove or narrow the old `ColumnId` type
- [ ] 1.2 Replace `bucketize()` return shape with `{ proposed, coded, reviewed, done, unphased }: PhaseBuckets`
- [ ] 1.3 Bucketing rule: a change with `change.phase` matching a known `Phase` goes into that lane; anything else (missing, unknown-string, `needs-human` if present — Phase 2b) → `unphased`
- [ ] 1.4 Preserve today's todo/inprogress/done sub-grouping as a helper `bucketizeByProgress(changes)` used ONLY by the Unphased section

## 2. Layout

- [ ] 2.1 Render 4 phase lanes in pipeline order (proposed → coded → reviewed → done) using the existing `<Column>` component with lane ids matching `Phase` values
- [ ] 2.2 Below the 4 lanes, render an "Unphased" section that internally shows todo / inprogress / done sub-groups via `bucketizeByProgress`; hide/collapse when empty (existing spec scenario 3)
- [ ] 2.3 Empty-state text per phase lane (e.g. "No changes in `coded`")
- [ ] 2.4 Widen `.kanban-board` grid CSS from 3 columns to 4 (Unphased is a full-width row below the lanes, not a 5th column)

## 3. Drag semantics

- [ ] 3.1 Every phase lane column is a `useDroppable` drop target with id equal to its `Phase` value
- [ ] 3.2 In `onDragEnd`: if `dropId` is a valid `Phase` and differs from `change.phase`, call `setChangePhase(change.id, dropId)`
- [ ] 3.3 If `dropId === change.phase` (same lane) → no-op
- [ ] 3.4 If `dropId === "unphased"` → no-op (unphasing is not supported by the API; opting out of the phase system would require a sidecar key delete, out of scope)
- [ ] 3.5 Every phase-lane card is draggable (not just TODO like the old layout). The `disabled` on `useDraggable` is dropped
- [ ] 3.6 The Unphased section's cards are draggable; dropping onto a phase lane opts in (existing spec scenario "opting in via drag")
- [ ] 3.7 Remove the old TODO→IN-PROGRESS `startImplementation` code path in `onDragEnd`; Start is button-only from here on

## 4. Card

- [ ] 4.1 `<PhaseControl>` `<select>` continues to render in `.kanban-card-head` unchanged
- [ ] 4.2 The existing Start / Merge / Discard / Archive button logic is preserved. In particular, `column === "done"` conditionals in `ChangeCard` need to become `lane === "done" || (progress-derived done inside Unphased)` — audit every use of the old `ColumnId`

## 5. Tests

- [ ] 5.1 Vitest for the new `PhaseBuckets` bucketing: given a mixed change set, correct lane assignment
- [ ] 5.2 Vitest for the Unphased sub-bucketing: legacy todo/inprogress/done stays intact inside the section
- [ ] 5.3 Manual: drag from `proposed` to `reviewed` → sidecar shows `phase: reviewed`, WS pushes change-updated
- [ ] 5.4 Manual: drop onto same lane → no network call (verify via devtools)
- [ ] 5.5 Manual: opt an unphased change into `proposed` by drag → sidecar gains `phase: proposed`

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-kanban-phase-lanes/specs/dashboard/spec.md` — one ADDED requirement ("Progress-Independent Phase Placement") pinning the phase-not-progress distinction
- [ ] 6.2 `npm run openspec -- validate add-kanban-phase-lanes` passes

## 7. Verification

- [ ] 7.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 7.2 Manual golden path: existing changes render in expected lanes (mix of phased + unphased); drag a card between two phase lanes; refresh the page; confirm lane sticks
- [ ] 7.3 Manual: unphased section renders with today's todo/inprogress/done sub-grouping
- [ ] 7.4 Manual: `<PhaseControl>` `<select>` still works (regression check)
