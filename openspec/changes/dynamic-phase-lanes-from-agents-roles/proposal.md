---
tags: [dashboard, kanban, phase, agents-yaml, dynamic-ui]
execution: worktree
---

## Why

The `add-phase-lane-view-toggle` change (in-flight on branch
`feature/add-phase-lane-view-toggle`, reverted from develop pending
this redesign) renders 4 hardcoded lanes: PROPOSE / CODE / PREVIEW /
DONE. The lane list is disconnected from `agents.yaml`: even when a
user's `agents.yaml` defines only `[code]` as a worker role, the
Phase view still shows PREVIEW (review) and DONE (verify) lanes that
never receive any transition activity. Empty lanes = misleading UI.

The Kanban's Phase view exists to show **workflow state**. Workflow
state is only meaningful for stages that will actually run. If the
user hasn't wired up a `review` agent, there is no `reviewed` phase
transition; the change never leaves `coded`. Showing a REVIEW lane
is misleading.

`agents.yaml` already declares which roles the user has wired up
(`propose` / `code` / `review` / `verify` / `manager` / `other`).
The Phase view should read that declaration and render exactly the
lanes that map to defined roles, plus a terminal `done` lane.

Superseded work: `add-phase-lane-view-toggle` established the
toggle + shared `<KanbanCard>` + `useKanbanActions` extraction.
This change keeps that infrastructure and replaces only the
lane-generation logic in `PhaseLaneBoard`.

## What Changes

### Lane derivation — dynamic from agents.yaml roles

- **Read `agents.yaml.agents[].roles`** via the existing
  `useStore((s) => s.agents)` (populated by `/api/agents/config`).
- **Aggregate the role set** across all agents. Manager fallback:
  `code` is always considered available (Manager self-dispatches
  via Task tool when no `code` role agent exists — per
  `/ithy-opsx:dispatch` skill's Manager fallback). `review` and
  `verify` are only "available" when explicitly declared.
- **Compute the lane list** in workflow order:
  `[propose?, code, review?, verify?, done]` where `?` means
  "included only if the role is declared". `code` and `done` are
  always present:
  - `code` — Manager can substitute via Task tool
  - `done` — terminal state, always meaningful
- **Lane labels** (present-continuous, active-state feel):
  - `propose` → `PROPOSING`
  - `code` → `CODING`
  - `review` → `REVIEWING`
  - `verify` → `VERIFYING`
  - `done` → `DONE`

### Bucketization — shift by one

- **Semantic shift**: a change appears in the lane for the **next
  stage** it awaits, not the last completed one:
  - phase undefined / unknown → `propose` (or first available lane if
    `propose` role not declared)
  - phase = `proposed` → `code` (awaiting code stage)
  - phase = `coded` → `review` if declared, else `done`
  - phase = `reviewed` → `verify` if declared, else `done`
  - phase = `done` → `done`
  - phase = `needs-human` → resolve via `priorPhase` under the
    same rules; if unresolvable, first available lane
- **No change is dropped**. If a phase would map to an undeclared
  role's lane, it falls through to the next declared lane (typically
  `done`).

### Rename from static labels

- The current `PhaseLaneBoard.tsx` (on `feature/add-phase-lane-view-
  toggle` branch) uses `PHASE_LABEL = { proposed: "PROPOSE", coded:
  "CODE", reviewed: "PREVIEW", done: "DONE" }`. This change replaces
  that with the dynamic-derivation approach above. The `PREVIEW`
  label is retired — the lane for `review` role is `REVIEWING`.

### No server changes

- Data source is `agents.yaml` (already served via
  `/api/agents/config`) and `change.phase` (already served via
  `/api/state`).
- No new endpoints, no WS events, no sidecar schema changes.

## Success

- **`agents.yaml` with only `[code]` role** → Phase view renders
  2 lanes: `CODING` + `DONE`. All changes fold into `CODING`
  (waiting for code or code done) or `DONE` (terminal).
- **`agents.yaml` with `[code, review]`** → 3 lanes: `CODING` +
  `REVIEWING` + `DONE`. `reviewed` phase changes appear in `DONE`
  (no verify stage will transition them).
- **`agents.yaml` with `[propose, code, review, verify]`** → 5 lanes:
  `PROPOSING` + `CODING` + `REVIEWING` + `VERIFYING` + `DONE`.
- **`agents.yaml` reloaded live** (via WS `agents-updated`) → lane
  list re-derives without page reload.
- **`needs-human` cards** appear in the lane for their `priorPhase`
  next-stage. Unresolvable `priorPhase` → first available lane.
- Card render identity unchanged (still `<KanbanCard>` shared with
  Board view).
- Non-goals from `add-phase-lane-view-toggle` preserved: no drag,
  no needs-human badges, no phase-transition affordances.

## Non-goals

- **No live worker-state visualization** (running vs queued). That is
  Phase 2 (`annotate-cards-with-worker-job-state`). This change is
  layout only.
- **No Manager activity visualization** (dispatching / waiting /
  cleanup). That is Phase 3 (`expose-manager-activity-per-change`).
- **No changes to `PHASES` enum** in `web/src/phases.ts` or
  `server/phases.ts`. The 4 phase values stay `proposed / coded /
  reviewed / done`; only the client's lane derivation shifts.
- **No changes to `Board` view** — the 3-column TODO / IN-PROGRESS /
  DONE toggle option stays unchanged.
- **No opinion on which agents.yaml roles the user should declare** —
  the change reads whatever is there.
