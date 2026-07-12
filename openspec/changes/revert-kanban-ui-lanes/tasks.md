## 1. Spec deltas

- [x] 1.1 3 REMOVED requirements in `specs/dashboard/spec.md`
- [x] 1.2 `npm run openspec -- validate revert-kanban-ui-lanes` VALID

## 2. Kanban.tsx — remove phase lanes, restore 3-column progress-derived layout

- [x] 2.1 Deleted `PhaseLane`, `UnphasedSection`, `PHASE_LABEL`, `PHASE_EMPTY` — replaced with a single `Column` component + `COL_LABEL` / `COL_EMPTY` tables
- [x] 2.2 Merged `bucketize` and `bucketizeByProgress` into a single progress-derived `bucketize(changes, jobByChange)` — `change.phase` is ignored entirely
- [x] 2.3 Slot type reduced to `"todo" | "inprogress" | "done"`
- [x] 2.4 Rewired `showArchiveInSlot` / `showStartArea` / `showReadyDot` for the new 3-value slot

## 3. Kanban.tsx — remove needs-human UI

- [x] 3.1 Deleted `WaitBadge` component and `formatWait` helper
- [x] 3.2 Deleted `isNeedsHuman` branch (className, question surfacing) from `ChangeCard`
- [x] 3.3 Deleted `needsHumanQuestion` display; the card intent line is always the proposal intent

## 4. CSS cleanup

- [x] 4.1 Removed `.kanban-board-phases`, `.kanban-wait-badge`, `.kanban-card.needs-human`, `.kanban-card-question`, `.kanban-unphased`, `.kanban-unphased-*` and their media-query siblings from `web/src/styles.css`

## 5. Test rewrite

- [x] 5.1 Rewrote `web/src/components/Kanban.test.ts` to assert the 3-column progress-derived layout + explicit assertion that `change.phase` is ignored

## 6. Target archive annotations

- [x] 6.1 Annotated `openspec/changes/archive/2026-07-05-add-phase-state-machine/proposal.md` with a "PARTIALLY REVERTED (Kanban UI portion)" note pointing at revert-kanban-ui-lanes
- [x] 6.2 Annotated `openspec/changes/archive/2026-07-05-add-kanban-phase-lanes/proposal.md` with a "REVERTED" note pointing at revert-kanban-ui-lanes

## 7. In-flight spec 注記 workflow

- [x] 7.1 Added `PENDING REMOVAL` annotation to the 3 target requirements in `openspec/specs/dashboard/spec.md` (Kanban Phase Swim Lanes / Legacy Fallback For Unphased Changes / Progress-Independent Phase Placement)
- [x] 7.2 Codified the convention in `CLAUDE.md` (new "In-flight spec 注記" hard rule)
- [x] 7.3 Codified the convention in `.claude/skills/openspec-flow/SKILL.md` (new "PENDING annotation" subsection under Revert)

## 8. Verification

- [x] 8.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.2 UI: Kanban renders **exactly 3 columns** (TODO / IN-PROGRESS / DONE) — no 5-column PROPOSED/CODED/REVIEWED/DONE/UNPHASED layout
- [ ] 8.3 UI: WaitBadge and needs-human card accent styling are gone (`.kanban-card.needs-human` / `.kanban-wait-badge` CSS no longer applied to any card)
- [ ] 8.4 UI: `+ New Change` is in the TODO column header; `Start ▾` is in the IN-PROGRESS column header (NOT in a top-of-board toolbar)
- [ ] 8.5 UI: Card head badges come from the agent job, never from `change.phase`

## 9. Post-impl

- [x] 9.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 9.2 archive → user runs `/ithy-opsx:archive` after confirming 8.2–8.5
