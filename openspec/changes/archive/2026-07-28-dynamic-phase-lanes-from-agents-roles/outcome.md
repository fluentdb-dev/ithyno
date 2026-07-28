# Outcome — dynamic-phase-lanes-from-agents-roles

Phase view lanes are no longer a fixed 4-column `PROPOSE / CODE / PREVIEW /
DONE` set. They are derived at render time from the roles declared in
`agents.yaml`, and bucketization is shifted by one so a card sits in the lane
for the **next** stage it awaits.

## ✅ Worked

- **Lane derivation is a pure function.** `deriveLaneList(agents)` filters a
  canonical `LANE_ORDER` constant rather than assembling a list imperatively,
  so workflow order can never drift out of sequence no matter what order the
  roles appear in `agents.yaml`. `code` and `done` live in an
  `ALWAYS_PRESENT` set; everything else is gated on the aggregated role set.
- **Live reactivity came for free.** `useStore((s) => s.agents)` is already
  refreshed by the `agents-updated` WS handler in `store.ts`, so the
  `useMemo(deriveLaneList, [agents])` re-runs on an `agents.yaml` edit with no
  new plumbing. Tasks 5.1 / 5.2 needed zero code — only a test
  (`dropping the review role re-flows its changes to done`) to pin the
  re-flow behavior.
- **`LANE_PREFERENCE` table over branching.** Routing is a
  `Record<Phase | "unphased", LaneId[]>` of most-specific-first candidates;
  `pickLane` takes the first candidate present in `laneIds` and falls back to
  `laneIds[0]`. That makes "no change is ever dropped" structural rather than
  something each branch has to remember, and it let the test suite assert the
  invariant generically by set-comparing input ids against the union of all
  buckets across four different lane sets.
- **Zero blast radius.** `KanbanCard`, `useKanbanActions`, `Overview.tsx`,
  `phases.ts`, and every server file are untouched. Tasks 4.1 / 4.2 were
  confirmations: `Overview.tsx` already passes `visibleChanges` (the
  `.kanban-filter`-narrowed list), so the filter narrows dynamic lanes for
  exactly the same reason it narrowed static ones.
- **`--lane-count` CSS variable** set inline keeps the grid honest for any
  lane count without emitting per-count CSS classes.

## ⚠️ Surprises

- **The `needs-human` fallback and the unphased fallback quietly agree.** The
  spec says unphased → `propose` lane if present else first lane, but
  `needs-human` with an unresolvable `priorPhase` → first lane. Those look
  like different rules; they aren't, because `propose` — when present — *is*
  the first lane. Kept them as separate code paths anyway so a future
  reordering of `LANE_ORDER` doesn't silently couple them.
- **`coded` must not walk past `review` into `verify`.** A naive "next
  available lane" walk would put a `coded` change into `VERIFYING` when
  `review` is undeclared but `verify` is. The spec is explicit that `coded`
  falls to `done` in that case, so `LANE_PREFERENCE.coded` is
  `["review", "done"]` — the omission of `verify` is deliberate, not an
  oversight.
- **`PhaseBuckets` keeps all five keys** even when only two lanes render. A
  `Partial<Record<...>>` would have forced non-null assertions at every call
  site; instead the absent lanes are guaranteed-empty arrays and the renderer
  iterates the derived lane list, never the bucket keys.
- **Flaky `server/doctor.test.ts`.** The first `npm test` run showed 4
  timeouts in `server/doctor.test.ts` (CLI-probe cold cache, 5s test timeout);
  a re-run passed clean. Unrelated to this change, but worth knowing it can
  fire once on a cold machine.
- **`scripts/build-icons.test.mjs`** fails on this machine (`sharp`
  ERR_MODULE_NOT_FOUND on Node 25.8). Pre-existing and out of scope, as
  flagged in the task brief.

## 🔁 Differently

- **Kept the helpers in `PhaseLaneBoard.tsx`** rather than extracting a
  sibling `phaseLanes.ts` (task 1.1 allowed either). The file is still ~230
  lines and the test already imported from `./PhaseLaneBoard`, so extraction
  would have been churn. If Phase 2
  (`annotate-cards-with-worker-job-state`) adds per-lane job aggregation, that
  is the moment to split.
- **Left the `@media` breakpoints hard-coded** at `repeat(2, …)` / `1fr`.
  They override `--lane-count` below 1200px, which is correct (5 lanes never
  fit on a narrow viewport) but means a 2-lane board gets a redundant rule.
  Harmless; a `min()`-based expression would be cleverer and less readable.
- **Retired `PHASE_LABEL` / `PHASE_EMPTY` maps.** The empty-lane copy is now
  a single `LANE_EMPTY_TEXT` constant — the old `PHASE_EMPTY` record held
  four identical strings.

## 🌱 Follow-ups

- **Task 8.5 (manual dev-server check) is left unticked.** Everything it
  covers is asserted by the unit tests (lane counts for `[]`, `[code]`,
  `[code, review]`, the full set; re-flow when a role disappears), but a human
  eyeballing the Phase view with a real `agents.yaml` is still worth doing
  before archive.
- **Lane count vs. column width.** With 5 lanes on a 1280px viewport each
  column is ~230px, which is tight for a `<KanbanCard>`. Consider a
  horizontal-scroll container with a `min-width` per lane instead of pure
  `1fr` division once the 5-lane configuration sees real use.
- **`propose` lane is currently write-only in practice.** Nothing transitions
  a change *into* `phase: proposed` other than the propose agent itself, so
  when a `propose` role is declared the lane holds unphased changes. Phase 3
  (`expose-manager-activity-per-change`) may want to distinguish "never
  phased" from "actively being proposed".
- **Role vocabulary is duplicated.** `LaneId` hard-codes
  `propose | code | review | verify` alongside whatever the agents.yaml
  loader considers valid roles. A shared constant would prevent drift if a
  fifth workflow role is ever added.
