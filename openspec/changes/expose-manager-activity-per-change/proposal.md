---
tags: [dashboard, kanban, manager, dispatch, sidecar, ws-event, ithy-opsx-dispatch]
execution: worktree
---

## Why

Phase 1 (`dynamic-phase-lanes-from-agents-roles`) and Phase 2
(`annotate-cards-with-worker-job-state`) together show:
- Which lane a change is in (based on next-stage per role config)
- What worker is running (or was recently running) on each change

What's still invisible: **Manager's own state**. Between spawning a
worker and receiving its report, Manager is in a long "waiting"
state (5–15 minutes typical for a poll cycle). Between "review pass"
and "verify start", Manager does cleanup (despawn, worktree remove
if applicable, phase advance) that takes seconds to a minute. During
these Manager-active periods, from the outside it looks like nothing
is happening — the code worker finished, but the review worker
hasn't started, and there's no visible "Manager is doing X" signal.

User's motivation: "cleanup などの manager の状態も細かくすべき
（そこそこ時間がかかるので）". The Manager phases are:

- `dispatching` — spawning a worker (Task tool call, agmsg spawn,
  or subprocess kick — usually <1 s)
- `waiting` — polling for a worker's report message (5–15 min)
- `judging` — parsing review.md, deciding pass/needs-rework/escalate
  (< 1 s)
- `cleanup` — worker despawn, worktree state cleanup, artifact
  commit (10 s – 2 min)
- `transitioning` — writing phase update to sidecar, broadcasting
  state-replaced (< 1 s)
- `idle` — no change in flight, or dispatch not running

This change adds per-change **Manager activity** tracking so the
Kanban can show which change Manager is currently touching and in
what capacity.

## What Changes

### Server — new `ManagerActivity` state

- **New module `server/manager-activity.ts`**:
  - In-memory map `Map<changeId, ManagerActivity>` where
    `ManagerActivity = { changeId, stage, activity, startedAt,
    detail? }`.
  - `stage` = `"code" | "review" | "verify"` (the dispatch stage
    Manager is orchestrating).
  - `activity` = `"dispatching" | "waiting" | "judging" |
    "cleanup" | "transitioning" | "idle"`.
  - `detail` = optional short string (e.g. worker name, elapsed
    hint, cleanup step).
  - Setter `setManagerActivity(update)`.
  - Clearer `clearManagerActivity(changeId)`.
  - Getter `getManagerActivity(changeId)`.

- **New endpoint `POST /api/manager/activity`** — session-token
  gated. Body: `{ changeId, stage, activity, detail? }`. Sets or
  clears (when `activity === "idle"`) the state. Broadcasts
  `manager-activity-updated` WS event on every write.

- **WS event schema extension**: `manager-activity-updated` with
  payload `{ changeId, activity: ManagerActivity | null }`.

### `/ithy-opsx:dispatch` skill — publish state at every boundary

- **`.claude/commands/ithy-opsx/dispatch.md`** — the dispatch loop
  posts to `/api/manager/activity` at each phase boundary:
  - Before spawning a worker: `POST { changeId, stage: "code",
    activity: "dispatching" }`
  - After spawn returns (worker running): `POST { activity:
    "waiting", detail: "code worker: <agentName>" }`
  - After receiving report: `POST { activity: "judging" }`
  - Before/during cleanup (despawn, worktree remove): `POST
    { activity: "cleanup", detail: "<step name>" }`
  - After phase advance: `POST { activity: "transitioning" }`
  - Before returning control to Manager (dispatch complete): `POST
    { activity: "idle" }` OR `clearManagerActivity(changeId)`
- Same pattern for `/ithy-opsx:dispatch-multi` (writes activity
  per-change, keyed by `change:<id>` message routing).

### Client — subscribe + render

- **`web/src/store.ts`**: new state field
  `managerActivity: Record<changeId, ManagerActivity>`. WS handler
  updates on `manager-activity-updated`.
- **`web/src/types.ts`**: mirror `ManagerActivity` type.
- **`KanbanCard`** (from Phase 2): extend indicator to also render
  Manager activity when present:
  - If `managerActivity[changeId]` is set, show a secondary badge
    (below or beside the worker-state indicator) with the activity
    icon + label:
    - `dispatching` — spinner + "dispatching"
    - `waiting` — hourglass + "waiting for <workerName>"
    - `judging` — brain icon + "judging"
    - `cleanup` — broom icon + "cleanup: <detail>"
    - `transitioning` — arrow icon + "transitioning"
    - `idle` — not shown (equivalent to absent)
  - Both `Job` state (Phase 2) and `ManagerActivity` may render
    together — Job = worker doing X, ManagerActivity = Manager
    orchestrating around it.

### Persistence semantics

- `ManagerActivity` is **in-memory only**. Server restart clears
  all activity. On restart, Manager (if it resumes) will re-post
  the current activity as it re-enters its loop.
- No sidecar field, no persistence. This is transient state, not
  workflow history.

## Success

- Dispatch a change → Kanban card shows "dispatching" → "waiting
  for <worker>" (with elapsed) → "judging" → "cleanup: despawn" →
  "transitioning" → indicator clears as dispatch completes.
- Multiple changes dispatched in parallel via `dispatch-multi` →
  each card shows its own Manager activity independently.
- Server restart → all `managerActivity` state clears (empty on
  first `/api/state` fetch after restart).
- `POST /api/manager/activity` with `activity: "idle"` (or missing)
  clears the entry for that change.
- WS `manager-activity-updated` fires exactly once per boundary
  post from the dispatch skill.
- No regression to existing `Job` state visualization (Phase 2).
- Non-dispatch changes (user viewing but no work in flight) show
  no Manager badge, only phase-derived lane placement.

## Non-goals

- **No persistence** of Manager activity to sidecar. Ephemeral only.
- **No opinion on when the dispatch skill posts** — this change
  provides the API and the skill's boundary posts; interior detail
  (how often to update `waiting` with elapsed hints, whether to
  distinguish `cleanup: despawn` from `cleanup: worktree-remove`)
  is left to skill-author discretion, initial impl uses coarse
  activities.
- **No API for user to manually set Manager activity** (e.g. from
  UI). The skill is the only writer.
- **No history / audit log** of past Manager activities per change.
- **No cross-Manager coordination** — a single Manager per project
  is assumed; multi-Manager (rare) is out of scope.
- **No changes to `add-phase-lane-view-toggle` semantics beyond
  what Phase 1 already established**. The Manager badge layers on
  top of the existing card, not the lane.
