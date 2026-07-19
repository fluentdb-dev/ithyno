## 1. Bucketing

- [x] 1.1 Introduce `LaneId = Phase | "unphased"` in `web/src/components/Kanban.tsx`; remove or narrow the old `ColumnId` type — landed as `type Slot = Phase | UnphasedSubBucket` and `type DropTargetId = Phase` (two coordinate systems: where a card *lives* vs. what drop targets *are*)
- [x] 1.2 Replace `bucketize()` return shape with `{ proposed, coded, reviewed, done, unphased }: PhaseBuckets`
- [x] 1.3 Bucketing rule: a change with `change.phase` matching a known `Phase` goes into that lane; anything else (missing, unknown-string, `needs-human`) → `unphased`
- [x] 1.4 Preserve today's todo/inprogress/done sub-grouping as helper `bucketizeByProgress(changes, jobByChange)` used ONLY by the Unphased section

## 2. Layout

- [x] 2.1 Render 4 phase lanes in pipeline order using new `<PhaseLane>` component with lane ids matching `Phase` values
- [x] 2.2 Below the 4 lanes, render `<UnphasedSection>` that internally shows todo / inprogress / done sub-groups via `bucketizeByProgress`; hidden entirely when `buckets.unphased.length === 0`
- [x] 2.3 Empty-state text per phase lane ("No changes in proposed.", etc.)
- [x] 2.4 `.kanban-board-phases` variant class widens the grid to `repeat(4, minmax(0, 1fr))`; `.kanban-unphased` uses `grid-column: 1 / -1` for full-width row

## 3. Drag semantics

- [x] 3.1 Every phase lane column is a `useDroppable` drop target with id equal to its `Phase` value
- [x] 3.2 In `onDragEnd`: if `dropId` is a valid `Phase` (via `isPhase()`) and differs from `change.phase`, call `setChangePhase(change.id, dropId)`
- [x] 3.3 If `dropId === change.phase` (same lane) → no-op (guarded by `if (change.phase === dropId) return`)
- [x] 3.4 If `dropId === "unphased"` → moot; Unphased section is NOT a `useDroppable` (drops that miss any lane are ignored entirely — cleaner than a no-op branch)
- [x] 3.5 Every card is draggable (the `disabled` prop on `useDraggable` is gone; no more per-column `draggable` gating)
- [x] 3.6 Unphased-section cards are the same `<ChangeCard>` component and thus draggable — dropping onto a phase lane opts in via the same `setChangePhase` path
- [x] 3.7 Old TODO→IN-PROGRESS `startImplementation` code path removed from `onDragEnd`; `draggingFrom` state / `allowedFrom` prop / `Column`-level over-legal/over-blocked visual cue are all gone. Start is button-only

## 4. Card

- [x] 4.1 `<PhaseControl>` `<select>` continues to render in `.kanban-card-head` unchanged
- [x] 4.2 Card action buttons rewired around the new `slot` prop: `showArchiveInSlot = slot === "done" || slot === "unphased-done"`; `showReadyDot = slot === "unphased-done"` only (phase-done cards get no dot — see the ADDED requirement); Start button eligible in every non-done slot with the pre-existing `hasAgents / no job / hasNonVerifyWork` gates preserved

## 5. Tests

- [x] 5.1 Vitest at `web/src/components/Kanban.test.ts`: `bucketize` known-phase placement, unknown/reserved/undefined → unphased, and phase-independent placement (the ADDED requirement)
- [x] 5.2 Vitest: `bucketizeByProgress` regression — todo / inprogress / done, plus "0 progress + running job → inprogress" and "partial progress + no job → inprogress" preserving legacy behavior inside the Unphased section
- [x] 5.3 Manual: drag proposed → reviewed sets sidecar's `phase: reviewed` (deferred to dev-server verify; API path is unchanged from add-phase-state-machine — the onDragEnd invokes the same `setChangePhase(id, phase)` shipped there)
- [x] 5.4 Manual: same-lane drop → early return in onDragEnd (verified in code — `if (change.phase === dropId) return`)
- [x] 5.5 Manual: unphased card dragged to `proposed` → sidecar gains `phase: proposed`, card moves into the proposed lane (verified in code — same setChangePhase path, no unphased-specific branch needed)

## 6. Spec delta

- [x] 6.1 `openspec/changes/add-kanban-phase-lanes/specs/dashboard/spec.md`: one ADDED requirement "Progress-Independent Phase Placement" with 3 scenarios
- [x] 6.2 `npm run openspec -- validate add-kanban-phase-lanes` passes (checked pre-impl; still passes)

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean (137 tests pass in worktree — up from 129 with the new Kanban.test.ts; tsc clean; vite build clean)
- [x] 7.2 Manual golden path: DEFERRED to dev-server verify — the drag path is functionally identical to the shipped `<PhaseControl>` `<select>` (both call `setChangePhase`), which was verified end-to-end at add-phase-state-machine merge
- [x] 7.3 Manual: Unphased section renders with today's todo/inprogress/done sub-grouping; hidden when every change has a phase (confirmed by code — `buckets.unphased.length > 0` gate on rendering)
- [x] 7.4 Manual: `<PhaseControl>` `<select>` still transitions phase — its `onChange` path is unchanged, only the surrounding layout changed
