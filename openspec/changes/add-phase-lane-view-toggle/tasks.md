# Tasks

## 1. Store — extend overviewLayout

- [x] 1.1 In `web/src/store.ts`, widen the `overviewLayout` field type from `"board" | "cards"` to `"board" | "phase" | "cards"`. Confirm the persist middleware still writes/reads this value; no schema-version bump needed since the union is additive.
- [x] 1.2 Add a defensive narrower on read: if the persisted value is not one of the 3 known strings, fall back to `"board"`. Landed to guard against future removals of the value.
- [x] 1.3 `setOverviewLayout` action already accepts a string; verify TS narrows the 3-arm union correctly at call sites.

## 2. Overview page — third toggle button

- [x] 2.1 In `web/src/pages/Overview.tsx`, add a third `<button role="tab">` inside the existing `.layout-toggle` group, positioned between the Board and Cards buttons.
- [x] 2.2 The button `aria-label="Phase lanes layout"`, `title="Phase lanes"`, `aria-selected={overviewLayout === "phase"}`, `className={overviewLayout === "phase" ? "active" : ""}`, `onClick={() => setOverviewLayout("phase")}`.
- [x] 2.3 Icon SVG: 4 vertical bars of equal height (16x16, matches the existing SVG stroke style of the other 2 buttons). Distinct enough at a glance from the 3-bar Board and 4-square Cards icons.
- [x] 2.4 Extend the conditional render below: when `overviewLayout === "phase"`, render `<PhaseLaneBoard changes={visibleChanges} onNewChange={() => setProposeOpen(true)} />` — the `else` branch collapses to Board-or-Cards as today.

## 3. New component — PhaseLaneBoard.tsx

- [x] 3.1 Create `web/src/components/PhaseLaneBoard.tsx`.
- [x] 3.2 Reference commit `3e4a60f` (`impl: add-kanban-phase-lanes`) for the historical implementation. Extract only the phase-lane rendering pieces:
  - `PHASE_LANES: PersistedPhase[]` — `["proposed", "coded", "reviewed", "done"]`.
  - `PHASE_LABEL: Record<PersistedPhase, string>` — user-facing lane headers.
  - `PHASE_EMPTY: Record<PersistedPhase, string>` — muted placeholder text per lane.
  - `bucketizeByPhase(changes)` — groups the change list by `change.phase` (falling back to `undefined` for the Unphased set). Returns `{ proposed, coded, reviewed, done, unphased }`.
  - `<PhaseLane phase, changes, onNewChange />` — a single lane column: header + card list + empty placeholder if the list is empty.
  - `<UnphasedSection changes />` — bottom fallback that reuses the current 3-column `bucketize()` (import from `Kanban.tsx` or duplicate — decide at impl time, preferring extraction if the copy would drift).
- [x] 3.3 The `Card` render body must match the Board view exactly. Extract a shared `<KanbanCard change />` component from `Kanban.tsx` if the JSX would otherwise drift; otherwise inline the same JSX literally.
- [x] 3.4 `needs-human` cards render in their `priorPhase` lane (the phase they were in before escalation) with NO badge, NO WaitBadge, NO visual annotation. If `priorPhase` is also undefined, they land in the Unphased fallback.
- [x] 3.5 No drag-and-drop. Do NOT wire `@dnd-kit`. Layout is read-only.
- [x] 3.6 The `onNewChange` prop is passed through and rendered as a `+ New Change` button in the toolbar area — same affordance as `<KanbanBoard />` provides.

## 4. CSS

- [x] 4.1 Add `.phase-lane-board` (root container), `.phase-lane` (single column, reuses `.kanban-col`-like padding/border), `.phase-lane-header` (name + count), `.phase-lane-empty` (muted placeholder for empty lanes), `.phase-unphased-section` (bottom fallback wrapper) to `web/src/styles.css`.
- [x] 4.2 Grid layout: 4 lanes on desktop (grid-template-columns: repeat(4, 1fr)), collapses to 2 columns on narrower widths, stacks vertically on mobile. Same responsive breakpoints as the existing Board layout.
- [x] 4.3 Unphased section renders below the 4-lane grid with its own row of TODO / IN-PROGRESS / DONE columns (reuses the same styles as the Board view).

## 5. Tests

- [x] 5.1 `web/src/components/PhaseLaneBoard.test.ts` (or `.tsx` if component testing) — verify:
  - `bucketizeByPhase` groups by phase correctly with all 4 phases represented.
  - Changes with undefined `phase` go into `unphased`.
  - `needs-human` changes land in `priorPhase` lane (or `unphased` if `priorPhase` also undefined).
  - Empty lanes render the `PHASE_EMPTY` placeholder text.
- [x] 5.2 `web/src/pages/Overview.test.ts` (if not present, add a minimal one) — verify toggle store round-trip: setting `overviewLayout` to `"phase"` renders `<PhaseLaneBoard>`.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate add-phase-lane-view-toggle --strict` passes.
- [x] 6.2 `npm test` passes (accepting the known-unrelated `scripts/build-icons.test.mjs` failure on Node 25.8).
- [x] 6.3 `npm run typecheck` passes.
- [x] 6.4 `npm run build` passes.
- [ ] 6.5 Manual: launch dev server → Overview toggle shows 3 buttons → click Phase → 4 lanes render → each lane holds the expected changes → Unphased section renders below (or is hidden if no unphased changes) → click Board → returns to 3-column view → reload page → Phase view is restored (persist works).
- [ ] 6.6 Manual: a change with `phase === "needs-human"` renders in its `priorPhase` lane (or Unphased if `priorPhase` is undefined) with NO badge — confirms non-goal boundary.
- [ ] 6.7 Manual: search filter (`kanban-filter`) filters cards in the Phase view too (both lanes and Unphased fallback should shrink to match).
- [x] 6.8 Write `openspec/changes/add-phase-lane-view-toggle/outcome.md` (What Worked / Surprises / Differently / Follow-ups).
