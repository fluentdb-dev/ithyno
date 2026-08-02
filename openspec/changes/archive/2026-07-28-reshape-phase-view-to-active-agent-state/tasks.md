# Tasks

## 1. Server — `JobSummary.role` field

- [x] 1.1 In `server/agents/registry.ts`, extend the `JobSummary` type with `role: string`. Runtime values from dispatch are the 4 standard strings; type stays `string` for `other` / custom.
- [x] 1.2 Every dispatch-time write to the Job registry populates `role` from the dispatch context (Manager knows).
- [x] 1.3 Backward-compat: a JobSummary without `role` (older on-disk state) → treat as `undefined`, log once with the Job id, degrade to DONE-lane bucketing in Phase view.
- [x] 1.4 Vitest covering code / review / verify / propose dispatch paths — each writes the corresponding `role`.

## 2. Server — Manager `stage` → `role` rename

- [x] 2.1 In `server/manager-activity.ts`, rename `ManagerStage` type → `ManagerRole`, add `"propose"` to the enum (equivalent to `JobSummary.role`'s standard set).
- [x] 2.2 Rename `ManagerActivity.stage` field → `role`. Rename the parse helper's `stage` handling → `role`.
- [x] 2.3 In the POST handler (`server/index.ts`), accept both `role` (new) and `stage` (deprecated alias) in the request body. When only `stage` present, coerce + log one-line deprecation.
- [x] 2.4 B2 persistence: writing an activity update SHALL NOT clear a previously-set `role` when the new update omits it (activity kind changes without role change → role sticks).
- [x] 2.5 Vitest for both new/old body shapes + the persistence rule.

## 3. Web — types mirror

- [x] 3.1 `web/src/types.ts`: mirror `JobSummary.role` and rename `ManagerActivity.stage` → `role`.
- [x] 3.2 Sweep all `web/src/**` for `.stage` on ManagerActivity — replace with `.role`. Sweep TypeScript compile errors as guide.

## 4. Web — `PhaseLaneBoard` reshape

- [x] 4.1 In `web/src/components/PhaseLaneBoard.tsx`, rename `bucketizeByPhase` → `bucketizeByActiveRole`. New signature: `(changes, jobByChange, managerActivityByChange, laneIds) => PhaseBuckets`.
- [x] 4.2 New logic:
  ```
  filter changes: (jobByChange.get(c.id)?.status === "running")
                || (managerActivityByChange[c.id]?.activity !== "idle")
                || (c.phase === "done")
  for each filtered c:
     if c.phase === "done" → bucket in DONE
     else if job → bucket in job.role (only if role ∈ STANDARD_4)
     else if managerActivity → bucket in managerActivity.role (only if ∈ STANDARD_4)
     else drop
  ```
- [x] 4.3 Change empty-lane placeholder text: `"No changes at this phase."` → `"No agent is currently on this role."`
- [x] 4.4 Delete the old `LANE_PREFERENCE` map + `pickLane` helper (unused after reshape). Keep `deriveLaneList` + `LANE_ORDER` + `LANE_LABEL` unchanged (P1 stays).
- [x] 4.5 Wire `managerActivityByChange` selector from the store (already exists per P3's server state; only the card-level badge is removed, not the store slice).

## 5. Web — remove Manager activity badge on card

- [x] 5.1 Delete `web/src/components/ManagerActivityBadge.tsx`.
- [x] 5.2 Delete `web/src/components/ManagerActivityBadge.test.ts`.
- [x] 5.3 In `web/src/components/KanbanCard.tsx`, remove the badge import, the `managerActivity` selector call (that was only used for the badge), and the badge render site.
- [x] 5.4 In `web/src/styles.css`, delete the `.manager-activity-badge*` + `.mgr-activity-*` selectors + the `spinner-rot` keyframe if only used by the badge.
- [x] 5.5 The store's `managerActivity` slice STAYS — Phase view bucketize (task 4.2) reads it.

## 6. Web — tests

- [x] 6.1 Rewrite `web/src/components/PhaseLaneBoard.test.ts` for the new bucketization:
  - Code Job running → CODING lane.
  - Review Job running → REVIEWING lane.
  - Manager `role: "verify", activity: "judging"` → VERIFYING lane (fallback).
  - Manager `role: "code", activity: "cleanup"` → CODING lane (B2).
  - Idle at coded → not in Phase view.
  - Idle at proposed → not in Phase view.
  - `phase: "done"` → DONE lane.
  - Non-standard `role: "other"` → filtered out.
  - Multi-role agent: Job.role wins over agents.yaml roles[].
- [x] 6.2 KanbanCard test: assert Manager badge is NOT rendered (or delete the test if it was Manager-specific). — Deleted alongside ManagerActivityBadge.test.ts in 5.2.

## 7. P1 change amendment

- [x] 7.1 Append a note to `openspec/changes/dynamic-phase-lanes-from-agents-roles/proposal.md` (after frontmatter) that the "Phase-lane bucketization routes changes to next-stage lane" requirement is superseded by `reshape-phase-view-to-active-agent-state`. `deriveLaneList` + label + DONE-lane semantics remain.

## 8. P3 change amendment

- [x] 8.1 Append a note to `openspec/changes/expose-manager-activity-per-change/proposal.md` (after frontmatter) that the card-level `ManagerActivityBadge` is removed by `reshape-phase-view-to-active-agent-state` per user preference ("Terminal で分かるので不要"). Server-side ManagerActivity tracking + WS broadcast remain — Phase view bucketize uses them.

## 9. Verification

- [x] 9.1 `npm run openspec -- validate reshape-phase-view-to-active-agent-state --strict` passes.
- [x] 9.2 `npm test` passes with rewritten PhaseLaneBoard test. — 603 passed, 1 unrelated failure (`scripts/build-icons.test.mjs` missing `sharp` in worktree).
- [x] 9.3 `npm run typecheck` clean.
- [x] 9.4 `npm run build` clean.
- [x] 9.5 Manual: `npm run dev`, Overview → Phase toggle, seed a change, dispatch. Verify: — puppeteer 検証で機能確認 (Board 26 cards → Phase view 4 cards = idle 22件フィルタ、empty text "No agent is currently on this role."、Manager activity badge 0)。Manager fallback / cleanup B2 は unit test 側で網羅済み。
  - Only actively-worked changes appear in their role lanes.
  - Idle changes don't appear.
  - Manager fallback (verify with no verify agent, Manager judges) surfaces in VERIFYING.
  - Manager cleanup after code keeps change in CODING (B2).
  - DONE lane shows all `done` changes regardless of activity.
  - No Manager activity badge on any card.
- [x] 9.6 Write `openspec/changes/reshape-phase-view-to-active-agent-state/outcome.md`.
