## ADDED Requirements

### Requirement: Phase view displays only active-role work, bucketed by role

The Phase view SHALL display **only** changes with an active role in
play — a change with no active worker Job and no active Manager
activity SHALL NOT appear, EXCEPT for `phase === "done"` changes which
appear in the DONE lane as historical record.

Bucketization key SHALL be the role currently in play:

- Worker Job (status: "running") → `Job.role` (must be one of the 4
  standard values: `"propose" | "code" | "review" | "verify"`; other
  values → change filtered out of Phase view).
- Manager activity (activity ≠ "idle") → `ManagerActivity.role`
  (same 4-standard-value enum).
- `phase === "done"` → DONE lane, regardless of activity.

Manager between-role activity (`dispatching / cleanup /
transitioning`) SHALL keep the change in the role lane matching the
most recent role the Manager was executing (B2 policy: `role` on
`ManagerActivity` is never cleared once set within a dispatch
session, only overwritten by the next role).

This supersedes the "Phase-lane bucketization routes changes to
next-stage lane" requirement proposed by
`dynamic-phase-lanes-from-agents-roles` on the same feature branch.

**Empty lane placeholder**: `"No agent is currently on this role."`

**Rationale**: user's intent is "Kanban does not display everything;
it displays agent state" (verbatim). The Board view remains the
place to see all changes bucketed by phase state.

#### Scenario: change with running code worker appears in CODING lane
- **GIVEN** change `X` has `Job { role: "code", status: "running" }`
- **AND** `agents.yaml` declares `code` role (CODING lane exists)
- **WHEN** Phase view renders
- **THEN** `X` appears in CODING lane
- **AND** the card's `WorkerStateIndicator` shows a `running` dot

#### Scenario: change with running review worker appears in REVIEWING lane
- **GIVEN** change `Y` has `Job { role: "review", status: "running" }`
- **AND** REVIEWING lane exists in the derived lane list
- **WHEN** Phase view renders
- **THEN** `Y` appears in REVIEWING lane regardless of `Y.phase` (the change's persisted phase does NOT influence bucketing)

#### Scenario: Manager fallback verify surfaces in VERIFYING lane
- **GIVEN** `agents.yaml` declares no `verify` role
- **AND** Manager is actively judging verify for change `Z`: `ManagerActivity { changeId: Z, role: "verify", activity: "judging" }`
- **AND** VERIFYING lane exists (Manager-fallback reserves it)
- **WHEN** Phase view renders
- **THEN** `Z` appears in VERIFYING lane
- **AND** the card does NOT render a Manager badge (deprecated per this change)

#### Scenario: Manager cleanup after code keeps change in CODING lane (B2)
- **GIVEN** Manager was dispatching code for change `W`; the code worker just finished
- **AND** Manager is now in `activity: "cleanup"` state; `role` is still `"code"` (not cleared)
- **WHEN** Phase view renders during that cleanup window
- **THEN** `W` remains in CODING lane
- **AND** transitions to REVIEWING lane only when Manager updates `role` to `"review"` in a subsequent activity

#### Scenario: idle change at coded phase does NOT appear in Phase view
- **GIVEN** change `V` at `phase === "coded"`, no active `Job`, no active `ManagerActivity`
- **WHEN** Phase view renders
- **THEN** `V` does NOT appear in any lane
- **AND** `V` DOES appear in Board view (unchanged)

#### Scenario: proposed change with no active worker does NOT appear in Phase view
- **GIVEN** change `U` at `phase === "proposed"`, no worker, no Manager activity
- **WHEN** Phase view renders
- **THEN** `U` does NOT appear (was: appeared in CODING under P1's shift-by-one)

#### Scenario: done change appears in DONE lane regardless of activity
- **GIVEN** change `T` at `phase === "done"`
- **WHEN** Phase view renders
- **THEN** `T` appears in DONE lane (terminal history)

#### Scenario: worker Job with non-standard role is filtered out
- **GIVEN** change `S` has `Job { role: "other", status: "running" }` (custom role, A1 policy)
- **WHEN** Phase view renders
- **THEN** `S` does NOT appear in any lane
- **AND** `S` DOES appear in Board view

#### Scenario: multi-role agent — Job.role is authoritative
- **GIVEN** an agent with `roles: [code, review]` currently running a Job dispatched as `review`
- **AND** `Job.role === "review"` (set by Manager at dispatch time)
- **WHEN** Phase view renders
- **THEN** the change is bucketed into REVIEWING (Job.role wins over agent's roles[] array)

#### Scenario: empty lane placeholder reflects role focus
- **GIVEN** CODING lane has zero changes with active code-role work
- **WHEN** Phase view renders the CODING lane
- **THEN** the lane body shows `"No agent is currently on this role."`

### Requirement: JobSummary carries the dispatch role

`JobSummary` (server + web/src/types.ts mirror) SHALL include a `role: string` field, populated at dispatch time. The Manager (or the code path that spawned the Job) knows the role and MUST write it.

Standard values consumed by Phase view: `"propose" | "code" | "review" | "verify"`. Any other value is accepted at the type level (`string`) but filtered out by Phase view rendering (A1 policy). Board view and other consumers may use the raw value as-is.

#### Scenario: dispatch sets JobSummary.role
- **GIVEN** dispatch spawns a code worker for change `X`
- **WHEN** the JobSummary is written to the registry
- **THEN** `JobSummary.role === "code"`

#### Scenario: legacy JobSummary without role degrades to DONE lane
- **GIVEN** a JobSummary from before this change was applied (no `role` field)
- **WHEN** Phase view renders that Job's change
- **THEN** the change is bucketed into DONE lane as fallback (not silently dropped)
- **AND** a one-time console warning names the Job id

### Requirement: Manager activity uses `role` (renamed from `stage`)

`ManagerActivity` (server-side + web/src/types.ts mirror) SHALL use a `role: "propose" | "code" | "review" | "verify"` field instead of `stage`. The rename unifies the vocabulary with `JobSummary.role` — Manager IS always executing one of the 4 roles at any active moment (even fallback verify = Manager playing verify role).

`POST /api/manager/activity` SHALL accept either `role` (new, preferred) or `stage` (deprecated alias, one release cycle) in the request body. When both are present, `role` wins. When only `stage` is present, log a one-line deprecation warning naming the request path and continue.

`role` SHALL be persistent across between-role Manager activities within a dispatch session: once set to (e.g.) `"code"`, it stays `"code"` through `dispatching / waiting / judging / cleanup / transitioning` states, and is overwritten only when Manager moves to a new role (B2 policy). This is what lets the Phase view keep the change in the last-role lane during Manager between-role work.

#### Scenario: POST /api/manager/activity accepts role
- **GIVEN** a POST body `{ changeId, role: "code", activity: "dispatching" }`
- **WHEN** the server processes it
- **THEN** the resulting `ManagerActivity.role === "code"`

#### Scenario: POST /api/manager/activity accepts stage as deprecated alias
- **GIVEN** a POST body `{ changeId, stage: "verify", activity: "judging" }`
- **WHEN** the server processes it
- **THEN** the resulting `ManagerActivity.role === "verify"`
- **AND** the server logs a deprecation warning

#### Scenario: role persists across cleanup transition
- **GIVEN** Manager was on `role: "code", activity: "dispatching"` for change `Q`
- **WHEN** the code worker finishes and Manager updates to `activity: "cleanup"` without changing `role`
- **THEN** the stored `ManagerActivity.role` remains `"code"`
- **AND** Phase view keeps `Q` in CODING lane during the cleanup window

### Requirement: Manager activity badge on card is removed

The dashboard SHALL NOT render a Manager activity badge on any Kanban card. Manager orchestration state is observable via the Terminal (embedded PTY) — a card-level badge is redundant.

`web/src/components/ManagerActivityBadge.tsx` SHALL be removed. `KanbanCard.tsx` SHALL not import or render it. Server-side `ManagerActivity` tracking + WebSocket broadcast SHALL remain (needed for the Phase view bucketize logic).

#### Scenario: KanbanCard has no Manager badge
- **GIVEN** a change with active `ManagerActivity`
- **WHEN** the Kanban card renders (in any view)
- **THEN** no Manager activity badge appears on the card
- **AND** the WorkerStateIndicator (P2) may still appear if the change has an active Job

#### Scenario: Server-side ManagerActivity API is unchanged
- **GIVEN** a client POSTs to `/api/manager/activity`
- **WHEN** the server processes the request
- **THEN** the endpoint accepts, stores, and broadcasts the activity as before
- **AND** the Phase view reads `managerActivity` state slice from the store to drive bucketization
