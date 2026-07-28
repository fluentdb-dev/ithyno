---
tags: [dashboard, kanban, phase, agent-state, ui, semantic-fix]
execution: worktree
---

## Why

`add-phase-lane-view-toggle` + `dynamic-phase-lanes-from-agents-roles`
(P1) + `annotate-cards-with-worker-job-state` (P2) +
`expose-manager-activity-per-change` (P3), currently on the unmerged
`feature/add-phase-lane-view-toggle` branch, implemented the Phase view
as "bucketize all changes by persisted phase (shift-by-one)" plus a
per-card worker state indicator (P2) plus a Manager activity badge
(P3).

Manual review against the user's original intent surfaced a semantic
mismatch. Restated verbatim:

> Coding は code エージェントが、review は review エージェントが、
> それ以外は manager クラスがフォールバックするものはそれぞれの
> フェーズのレーンが表示されるというものです。このカンバンは全てを
> 表示しません。エージェントの状態を表示するものです。
>
> Managerが何かしているのは、ターミナルを見ればなんとなくはわかる
> のでいらない、roleとしての表示のみ。

Corrected intent:

- **Phase view = agent role state visualization**, not a phase-state
  bucketing of all changes.
- A change appears **only when a role (code / review / verify /
  propose) is actively being executed** for it, whether by a
  dedicated worker or by Manager fallback. The bucket key is the role
  being executed.
- Idle / queued changes → not displayed in Phase view (Board view
  handles those).
- **Manager's own orchestration state is not displayed** — the user
  can read that from the Terminal. No Manager activity badge on cards.
- **Between-role Manager work (cleanup / transitioning) keeps the
  change in its last role's lane** for visual continuity.
- **Non-standard roles (`other`, custom) are ignored** — Phase view
  is for the standard workflow (propose / code / review / verify).
  Custom-role work is visible in Board view.

## What Changes

### Role signal — `JobSummary.role` added

- **`server/agents/registry.ts`**: extend `JobSummary` with
  `role: "propose" | "code" | "review" | "verify"`. Populated at
  dispatch time from the Manager's dispatch context.
- **`web/src/types.ts`**: mirror.
- Custom / `other` roles → `JobSummary.role` is set to the raw string
  but the Phase view ignores anything outside the 4 standard values
  (A1 policy).

### Bucketization — filter by active work, key by role (not phase)

- **`web/src/components/PhaseLaneBoard.tsx`** `bucketizeByPhase` →
  rename to `bucketizeByActiveRole`. Signature changes to accept
  `jobByChange` and `managerActivityByChange` maps.
- Behavior:
  1. Filter `changes` to those with:
     - Active worker `Job` (status === "running"), OR
     - Active `ManagerActivity` with a resolvable role
       (`activity !== "idle"`), OR
     - `phase === "done"` (terminal, always show as history).
  2. Bucket each filtered change:
     - `phase === "done"` → DONE lane.
     - Worker Job present → `job.role` lane (if `role` is one of the
       4 standard values; otherwise filter out).
     - Manager activity → `managerActivity.role` lane (rename from
       `stage`, same 4 standard values).
- **B2 policy for between-role Manager work**: when `activity` is
  `dispatching / cleanup / transitioning`, keep the change in the
  role lane matching the most recent role the Manager was on. This
  is implemented by having Manager write `role` on every activity
  update, including the between-role transitions (never null once
  set for a session).

### Manager activity badge on card — REMOVED (P3 client-side deprecated)

- **`web/src/components/ManagerActivityBadge.tsx`** — delete.
- **`web/src/components/KanbanCard.tsx`** — remove the badge render
  site + `managerActivity` selector usage.
- **`web/src/store.ts`** — keep the `managerActivity` state slice
  (needed for Phase view's bucketize + optional future consumers) but
  stop rendering it on the card.
- Rationale: user reads Manager state from the Terminal directly; the
  card-level badge added visual noise without new information.

### Manager `stage` → `role` rename (server + client)

- **`server/manager-activity.ts`**: rename `ManagerStage` type →
  `ManagerRole`, `stage` field → `role`, add `"propose"` to the
  enum. Keep the same 4-value enum as `JobSummary.role`.
- **`server/index.ts`** (POST /api/manager/activity handler) — accept
  either `stage` (deprecated alias) or `role` in the request body for
  one release cycle; log a deprecation when `stage` is used.
- **`web/src/types.ts`**: mirror.
- Rationale: Manager IS executing one of the roles at any moment
  (even fallback verify = Manager playing verify role). Separate
  `stage` vs `role` was accidental complexity.

### Worker state indicator on card — kept (P2 stays)

- **`web/src/components/WorkerStateIndicator.tsx`** — no change.
  Running / completed / crashed / orphaned dot stays.
- `queued` branch becomes unreachable in Phase view (queued = idle =
  filtered out) but still lives for Board view usage.
- Rationale: the dot is role-execution state within the lane, which
  is the primary signal Phase view wants. Not Manager noise.

### Empty lane text

- Change `"No changes at this phase."` → `"No agent is currently on
  this role."` to reflect the agent-focus.

## Capabilities

### Modified Capabilities

- `dashboard`:
  - Phase view bucketization (P1) reshaped from "phase-state
    shift-by-one" to "active-role only, key by role".
  - Manager activity display (P3) reduced from card badge + server
    tracking to server tracking only.
  - Manager stage / role naming unified to `role`.

## Impact

- **`JobSummary` gains `role` field** (server + web mirror). Additive,
  backward-compat for old-format records via fallback (DONE lane).
- **`ManagerActivity.stage` → `role`** with deprecation alias for one
  release cycle.
- **`ManagerActivityBadge.tsx`, its test, its styles** removed.
- **`KanbanCard.tsx`** trims the badge render site (~15 LoC).
- **`PhaseLaneBoard.tsx`** bucketize logic rewritten (~40 LoC net).
- **Tests**: `PhaseLaneBoard.test.ts` rewritten to cover new
  semantics; `ManagerActivityBadge.test.ts` deleted; `KanbanCard.test`
  (if exists) trimmed.
- **No changes to Board view or Cards view** — they keep their
  current bucketization semantics.
- **No changes to `/ithy-opsx:dispatch` skill or other slash
  commands** — the reshape is server + client only.

## Non-goals

- **Does NOT reintroduce the `stage` field.** Everything is `role`.
- **Does NOT remove server-side ManagerActivity tracking.** Only the
  card-level badge display is removed. The server state is needed by
  the Phase view bucketize logic.
- **Does NOT change lane derivation from `agents.yaml`.** P1's
  `deriveLaneList` continues to filter `LANE_ORDER` by declared
  roles.
- **Does NOT display `other` or custom roles.** Those changes are
  visible in Board view; Phase view remains a standard-4-role display.
