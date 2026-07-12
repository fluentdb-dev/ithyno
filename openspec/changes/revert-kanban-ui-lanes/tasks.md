## 1. Spec deltas

- [ ] 1.1 3 REMOVED requirements in `specs/dashboard/spec.md`
- [ ] 1.2 `npm run openspec -- validate revert-kanban-ui-lanes` VALID

## 2. Kanban.tsx — remove phase lanes, restore 3-column progress-derived layout

- [ ] 2.1 Delete `PhaseLane`, `UnphasedSection`, `PHASE_LABEL`, `PHASE_EMPTY` components / constants
- [ ] 2.2 Delete phase branches from `bucketize` and re-instate the simple TODO / INPROGRESS / DONE grouping
- [ ] 2.3 Delete `slot === "proposed" | "coded" | "reviewed" | "done" | "unphased-*"` slot type and consumers; use simple `"todo" | "inprogress" | "done"` slot
- [ ] 2.4 Rewire `showArchiveInSlot`, `showStartArea`, `showReadyDot` for the new slot enum

## 3. Kanban.tsx — remove needs-human UI

- [ ] 3.1 Delete `WaitBadge` component
- [ ] 3.2 Delete `isNeedsHuman` branch (className, question surfacing) from `ChangeCard`
- [ ] 3.3 Delete `needsHumanQuestion` display from card

## 4. CSS cleanup

- [ ] 4.1 Remove `.kanban-phase-lane`, `.kanban-unphased-*`, `.wait-badge`, `.needs-human` (and any related helpers) from `web/src/styles.css`

## 5. Test rewrite

- [ ] 5.1 Rewrite `web/src/components/Kanban.test.ts` to assert the 3-column layout and progress-derived placement; drop phase-specific assertions

## 6. Target archive annotations

- [ ] 6.1 Annotate `openspec/changes/archive/2026-07-05-add-phase-state-machine/proposal.md` with a "Reverted (Kanban UI portion) by revert-kanban-ui-lanes" note at the top of the file
- [ ] 6.2 Annotate `openspec/changes/archive/2026-07-05-add-kanban-phase-lanes/proposal.md` with a "Reverted by revert-kanban-ui-lanes" note at the top of the file

## 7. Verification

- [ ] 7.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 7.2 Manual smoke: Kanban shows 3 columns; cards with `phase: coded` still appear in TODO/INPROGRESS/DONE by progress alone; cards with `phase: needs-human` render with no badge

## 8. Post-impl

- [ ] 8.1 phase-workflow へ merge (worktree flow)
- [ ] 8.2 archive → phase-workflow に archive commit
