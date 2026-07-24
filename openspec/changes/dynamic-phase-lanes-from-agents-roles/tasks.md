# Tasks

## 1. Role aggregation helper

- [ ] 1.1 In `web/src/components/PhaseLaneBoard.tsx` (or extract to a sibling helper `phaseLanes.ts`), add `deriveLaneList(agents: AgentPublic[]): Array<{ id: LaneId; label: string }>`:
  - Aggregate all roles across `agents[].roles`.
  - Return the ordered lane list `[propose?, code, review?, verify?, done]`.
  - `code` and `done` are always included.
  - Others are included only when at least one agent declares that role.
- [ ] 1.2 Define `LaneId = "propose" | "code" | "review" | "verify" | "done"` type.
- [ ] 1.3 Label map: `LANE_LABEL: Record<LaneId, string> = { propose: "PROPOSING", code: "CODING", review: "REVIEWING", verify: "VERIFYING", done: "DONE" }`.

## 2. Bucketization — shift by one

- [ ] 2.1 `bucketizeByPhase(changes, laneIds): Record<LaneId, Change[]>` — routes each change to the lane for its NEXT stage:
  - Undefined / unknown → `propose` if in laneIds, else the first laneId.
  - `proposed` → `code`.
  - `coded` → `review` if in laneIds, else `done`.
  - `reviewed` → `verify` if in laneIds, else `done`.
  - `done` → `done`.
  - `needs-human` → recurse with `priorPhase` under the same rules; if `priorPhase` also unresolvable, first laneId.
- [ ] 2.2 The function receives the derived `laneIds` (from 1.1) so its output shape matches whatever lanes are being rendered.

## 3. PhaseLaneBoard render

- [ ] 3.1 Read `agents` from the store: `const agents = useStore((s) => s.agents);`.
- [ ] 3.2 Compute `lanes = deriveLaneList(agents)` and `buckets = bucketizeByPhase(changes, lanes.map((l) => l.id))` via `useMemo` keyed on `[changes, agents]`.
- [ ] 3.3 Render one `<PhaseLane>` per element of `lanes` (dynamic count). Header shows `LANE_LABEL[id]` + card count.
- [ ] 3.4 Grid CSS: `grid-template-columns` set inline via a `--lane-count` CSS variable so the layout adapts (2 lanes → 2 columns, 5 lanes → 5 columns).
- [ ] 3.5 Empty lane placeholder unchanged ("No changes at this phase.").
- [ ] 3.6 Preserve the `+ New Change` affordance in the leftmost lane's header.

## 4. Overview page integration

- [ ] 4.1 No changes needed — `<PhaseLaneBoard changes={visibleChanges} onNewChange={...} />` invocation stays as-is; the component itself picks up `agents` from the store.
- [ ] 4.2 Confirm the search filter (`.kanban-filter`) still narrows both static AND dynamic lanes.

## 5. Live reactivity

- [ ] 5.1 Verify that when `agents.yaml` changes (WS `agents-updated` event) and the store's `agents` field updates, the Phase view re-derives lanes without a full reload.
- [ ] 5.2 If the user opens the Phase view while an `agents-updated` event fires that removes a role, changes previously in that lane should re-flow to the appropriate fallback per 2.1.

## 6. CSS

- [ ] 6.1 `web/src/styles.css`: replace hard-coded `.phase-lane-board { grid-template-columns: repeat(4, 1fr); }` with a variable-driven form `grid-template-columns: repeat(var(--lane-count, 4), 1fr);`.
- [ ] 6.2 Delete `.phase-unphased-section` and related CSS (no longer used in this Phase 1 revision; Unphased was already removed in the phase-lane worker's amend commit).

## 7. Tests

- [ ] 7.1 `web/src/components/PhaseLaneBoard.test.ts` — replace the previous `bucketizeByPhase` tests with:
  - `deriveLaneList` returns expected shapes for role sets `[]`, `[code]`, `[code, review]`, `[propose, code, review, verify]`.
  - `bucketizeByPhase` routes each phase value to the correct lane under different `laneIds` inputs (fallback correctness).
  - `needs-human` with a valid `priorPhase` resolves to that phase's next-stage lane; with an invalid `priorPhase`, folds to first lane.

## 8. Verification

- [ ] 8.1 `npm run openspec -- validate dynamic-phase-lanes-from-agents-roles --strict` passes.
- [ ] 8.2 `npm test` passes (accepting the known-unrelated `scripts/build-icons.test.mjs` failure on Node 25.8).
- [ ] 8.3 `npm run typecheck` passes.
- [ ] 8.4 `npm run build` passes.
- [ ] 8.5 Manual: launch dev server → Phase view shows lane count matching current `agents.yaml` role set. Modify `agents.yaml` roles → lane count updates without reload.
- [ ] 8.6 Write `openspec/changes/dynamic-phase-lanes-from-agents-roles/outcome.md`.
