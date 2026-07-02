## 1. Web: startable predicate

- [x] 1.1 Add `startableCandidates(changes, jobByChange, agents)` helper in `web/src/util/changeState.ts` reusing `hasNonVerifyWork` + `isRunningOrPending` + progress check
- [x] 1.2 Unit test `startableCandidates` in `web/src/util/changeState.test.ts` covering: no agents → empty; all running → empty; verify-only excluded; DONE excluded; mix returns only the startable ones

## 2. Web: launcher component

- [x] 2.1 New `web/src/components/ParallelStartLauncher.tsx` — button + popover
- [x] 2.2 Button label `Start ▾` with `(<n>)` badge showing candidate count
- [x] 2.3 Disabled states: 0 agents / 0 candidates, with `title` tooltip carrying the reason
- [x] 2.4 Popover: list of candidates each with change id, tag chips, progress (`d/t`)
- [x] 2.5 Click a candidate → call `startImplementation(change)` from `useStartFlow` and close the popover
- [x] 2.6 Dismissal: outside-click + Escape both close the popover

## 3. Web: Kanban integration

- [x] 3.1 `Column` component accepts an optional `headerAction` node for the right-side header slot; TODO's `+ New Change` uses the same slot
- [x] 3.2 Mount `<ParallelStartLauncher>` in the IN-PROGRESS column header only
- [x] 3.3 Pass the same `agents`, `jobByChange`, and `startImplementation` handles the Kanban already computes; do not duplicate state

## 4. Styles

- [x] 4.1 Button matches `+ New Change` visual (same class family), adjust color/weight for a secondary action (`ghost` variant)
- [x] 4.2 Popover: absolute-positioned, max-width ~340px, shadow, right-aligned so it doesn't overflow past the DONE column
- [x] 4.3 Candidate row hover state

## 5. Docs

- [x] 5.1 Update `docs/architecture/parallel-shells.md` with a note that the launcher is the primary "start another one alongside" affordance

## 6. Verification

- [ ] 6.1 Open dashboard with agents defined and 3 TODO changes: launcher shows `Start ▾ (3)`
- [ ] 6.2 Start one via card Start; count drops to 2 immediately (running job excluded)
- [ ] 6.3 Open launcher, pick another → picker or direct spawn per proposal.execution; both jobs run in parallel
- [ ] 6.4 verify-only or DONE changes never appear in the popover
- [ ] 6.5 With `agents.yaml` empty, launcher is disabled with clear reason
- [ ] 6.6 Escape and outside-click both close the popover without spawning
