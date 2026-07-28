## ADDED Requirements

### Requirement: Manager activity is tracked per change

The ithyno server SHALL maintain an in-memory per-change record of Manager's current orchestration activity, of shape:

```
{
  changeId: string,
  stage: "code" | "review" | "verify",
  activity: "dispatching" | "waiting" | "judging" | "cleanup" | "transitioning" | "idle",
  startedAt: number,          // epoch ms
  detail?: string             // short human-readable hint
}
```

The record SHALL be:
- **In-memory only** (no sidecar persistence, no restart survival).
- **Set / cleared** via `POST /api/manager/activity` (session-token gated). Setting `activity: "idle"` SHALL clear the entry.
- **Retrievable in bulk** via `GET /api/manager/activity` (returns `Record<changeId, ManagerActivity>`).
- **Broadcast** on every set/clear via WS event `manager-activity-updated` with payload `{ changeId, activity: ManagerActivity | null }`.

Server restarts SHALL clear all Manager-activity state. The dispatch skill is responsible for re-posting current state as it re-enters its loop.

#### Scenario: Set activity broadcasts and persists in memory
- **GIVEN** the server is running with an empty Manager-activity map
- **WHEN** a client POSTs `{ changeId: "x", stage: "code", activity: "waiting", detail: "claude" }` with a valid session token
- **THEN** the endpoint responds 200 OK
- **AND** `GET /api/manager/activity` returns `{ x: { changeId: "x", stage: "code", activity: "waiting", detail: "claude", startedAt: <ts> } }`
- **AND** a WS `manager-activity-updated` event fires with the same payload

#### Scenario: Idle activity clears the entry
- **GIVEN** activity is set for change `x`
- **WHEN** a client POSTs `{ changeId: "x", activity: "idle" }`
- **THEN** the entry for `x` is removed from the map
- **AND** the WS broadcast payload has `activity: null`

#### Scenario: Server restart clears all activities
- **GIVEN** activities are set for multiple changes
- **WHEN** the server restarts
- **THEN** `GET /api/manager/activity` returns `{}` immediately after restart

#### Scenario: Unauthorized POST rejected
- **GIVEN** the server is running
- **WHEN** a client POSTs without a session token (or with an invalid one)
- **THEN** the endpoint responds 401
- **AND** no WS broadcast fires
- **AND** the in-memory map is unchanged

### Requirement: Dispatch skill publishes Manager activity at every phase boundary

The `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi` skills (files `.claude/commands/ithy-opsx/dispatch.md` and `.claude/commands/ithy-opsx/dispatch-multi.md`) SHALL invoke `POST /api/manager/activity` at each orchestration boundary so the dashboard has near-real-time visibility into Manager's current activity per change.

Boundaries SHALL be published in this sequence for each `(change, stage)` combination:

1. Before spawning the worker (Task tool call, agmsg spawn, or subprocess): `activity: "dispatching"`.
2. Immediately after spawn returns (worker running, poll loop starts): `activity: "waiting"`, `detail: "<worker-agent-name>"`.
3. When a worker report arrives and Manager begins inspection: `activity: "judging"`.
4. During Manager cleanup (despawn, worktree state, artifact commit): `activity: "cleanup"`, `detail: "<step>"`.
5. When Manager writes the phase-update to sidecar: `activity: "transitioning"`.
6. When dispatch returns control (success, escalation, or timeout for that change): `activity: "idle"` (clears the entry).

For `dispatch-multi`, publications SHALL carry the correct `changeId` per activity update so multiple parallel dispatches remain distinguishable.

#### Scenario: Full dispatch lifecycle publishes the expected sequence
- **GIVEN** a Manager PTY runs `/ithy-opsx:dispatch add-example` on a fresh change
- **WHEN** the dispatch proceeds through code stage
- **THEN** the following POSTs fire in order (approximately):
  1. `{ changeId: "add-example", stage: "code", activity: "dispatching" }`
  2. `{ changeId: "add-example", stage: "code", activity: "waiting", detail: "claude" }`
  3. `{ changeId: "add-example", stage: "code", activity: "judging" }`
  4. `{ changeId: "add-example", stage: "code", activity: "cleanup", detail: "despawn" }`
  5. `{ changeId: "add-example", stage: "code", activity: "transitioning" }`
- **AND** the same sequence repeats for `stage: "review"` and `stage: "verify"` as those stages run.
- **AND** at end of dispatch, a final `{ changeId: "add-example", activity: "idle" }` fires.

#### Scenario: Parallel dispatch keeps per-change activity separate
- **GIVEN** Manager runs `/ithy-opsx:dispatch-multi X Y`
- **WHEN** both dispatches are mid-flight (X in `waiting` for code, Y in `judging` for review)
- **THEN** `GET /api/manager/activity` returns entries for both `X` and `Y` with their respective distinct states
- **AND** each subsequent WS broadcast is scoped to a single `changeId`

### Requirement: Dashboard displays Manager activity on Kanban cards

The dashboard SHALL render a per-card Manager-activity badge when `managerActivity[changeId]` is defined. The badge SHALL be secondary to (and coexist with) the Job worker-state indicator introduced by `annotate-cards-with-worker-job-state`.

Rendering rules per activity value:

- `dispatching` — spinner (animated) + "dispatching" label.
- `waiting` — hourglass icon + "waiting" + `detail` when present.
- `judging` — brain / thinking icon + "judging".
- `cleanup` — broom / trash icon + `"cleanup: ${detail ?? ''}"`.
- `transitioning` — arrow icon + "transitioning".
- `idle` — badge SHALL NOT render (state is equivalent to absent).

The badge SHALL also render elapsed time since `startedAt` in a small muted suffix.

#### Scenario: Waiting badge renders with agent detail and elapsed
- **GIVEN** `managerActivity["x"] = { activity: "waiting", detail: "claude", startedAt: <2 minutes ago> }`
- **WHEN** card `x` renders
- **THEN** the Manager badge shows an hourglass icon + "waiting: claude" + "2m" elapsed suffix

#### Scenario: Cleanup badge shows step detail
- **GIVEN** `managerActivity["y"] = { activity: "cleanup", detail: "worktree-remove", startedAt: <15s ago> }`
- **WHEN** card `y` renders
- **THEN** the badge shows a cleanup icon + "cleanup: worktree-remove" + "15s"

#### Scenario: Both worker-state and Manager badges coexist
- **GIVEN** change `z` has `job.status = "running"` AND `managerActivity["z"] = { activity: "waiting" }`
- **WHEN** card `z` renders
- **THEN** both the worker-state indicator (pulse dot + agent name) AND the Manager activity badge (hourglass + waiting) are visible on the card
- **AND** the two indicators are visually distinguishable

#### Scenario: Idle change shows no Manager badge
- **GIVEN** a change with no `managerActivity` entry
- **WHEN** the card renders
- **THEN** no Manager activity badge appears on the card
