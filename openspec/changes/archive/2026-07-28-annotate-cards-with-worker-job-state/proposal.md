---
tags: [dashboard, kanban, phase, agent-runner, job, ui]
execution: worktree
---

## Why

Phase 1 (`dynamic-phase-lanes-from-agents-roles`) makes Phase-view
lanes reflect the workflow's declared stages. But cards within a
lane don't distinguish between:

- **Idle** — no worker running; the change is queued for the lane's
  stage to start
- **Active** — a worker is currently running (spawned by
  `/ithy-opsx:dispatch`, tracked in the Job registry)
- **Recently completed** — a worker just finished; the change is
  moving to the next lane (transient state, seconds)

User's motivation: "agent の状態を知りたい". Seeing "code lane has 3
cards" doesn't tell you which one is actively being coded RIGHT NOW.

The Job registry already tracks per-change per-agent state (`status:
running | completed | cancelled | crashed | orphaned`). The Card
component already receives a `job?: JobSummary` prop (used today for
a small agent-name badge). This change extends that annotation to be
a **visual state indicator**:

- `running` → animated pulse dot + agent name + elapsed time
- `queued` (no job for this lane's stage yet) → static muted "queued"
  hint
- `completed` (Job status is `completed` but change hasn't moved to
  next phase yet) → brief "done" checkmark, fades
- `crashed / cancelled / orphaned` → red/muted warning badge

The annotation is visible in BOTH the Board view (existing 3-column)
and the Phase view (Phase 1's dynamic lanes), because it's a Card-
level concern.

## What Changes

### KanbanCard extension

- **`web/src/components/KanbanCard.tsx`** (shared card component
  from `feature/add-phase-lane-view-toggle`): extend the existing
  `AgentBadge` (or extract a new `WorkerStateIndicator`) to render
  based on `job.status`:
  - `running` → colored dot with pulse animation + `{agent} · {elapsed}`
    where elapsed is derived from `job.startedAt` (updates every
    30 s via `useEffect` interval).
  - `completed` (and change.phase advanced) → not shown (transient
    state absorbed by the phase update).
  - `completed` (and change.phase NOT advanced, e.g. review pass
    but Manager hasn't dispatched verify yet) → gray checkmark +
    "done" (persists until Job clears from registry or phase
    advances).
  - `crashed` / `cancelled` / `orphaned` → red warning badge with
    the status label; tooltip = `job.exitCode` or reason.
  - No job → static muted dot with "queued" text (Phase view only —
    Board view leaves it blank because "queued for what" is
    ambiguous there).

### Job data flow

- The store already exposes `jobs: JobSummary[]` (per
  `add-agent-runner`, extended in Phase 3.4 of the earlier arc).
  Confirm KanbanCard receives its `job` via `useKanbanActions`'s
  `jobByChange.get(c.id)` and that this map covers current + recent
  finished jobs.
- If `jobByChange` currently drops completed jobs immediately, hold
  them briefly (e.g. 30 s after `finishedAt`) so the "just finished"
  state has a moment to render before disappearing. Implement in
  `useKanbanActions` OR in the store's job reducer.

### Elapsed-time formatter

- Small helper `formatElapsed(startedMs: number): string` — returns
  `"12s"` / `"1m 5s"` / `"3m"` / `"1h 12m"` per common format.
- 30 s poll interval for card refresh (`setInterval` inside
  `KanbanCard`'s useEffect). Cleanup on unmount.

### CSS

- `.worker-state-dot` — colored circle, 8px, positioned inline
  before the agent name.
- `.worker-state-dot.running` — accent color + `@keyframes pulse`
  animation.
- `.worker-state-dot.completed` — gray, no animation.
- `.worker-state-dot.crashed` / `.cancelled` / `.orphaned` — red,
  no animation.
- `.worker-state-elapsed` — muted, small font.

### No server changes

- All data (Job status, startedAt, finishedAt, exitCode) is already
  in `JobSummary` type. No new endpoint or WS event. Existing
  `agents-updated` and `job-updated` WS events (if the latter
  exists) drive card refresh.

## Success

- **A dispatched worker is running on change X** → card X shows an
  animated pulse dot + agent name + elapsed time updating.
- **Worker finishes successfully** → dot turns to a checkmark for
  a few seconds, then card returns to base state as `change.phase`
  advances.
- **Worker crashes** → red warning dot with the exit code /
  reason on hover.
- **No worker for a change** → in Phase view, card shows muted
  "queued" hint; in Board view, no annotation.
- **Card render identity between Board and Phase views** preserved
  (the state indicator is part of the shared `<KanbanCard>` so both
  views get it).
- No new server calls; annotations derive from the existing job
  data flow.

## Non-goals

- **No lane derivation changes**. This change layers on top of Phase
  1's dynamic lanes; the lane logic isn't touched.
- **No Manager-activity visualization** (dispatching / waiting /
  cleanup — Phase 3).
- **No history / audit log of past jobs**. Only current + very
  recent (< 30 s post-finish) jobs annotate the card.
- **No drag interactions** — cards remain non-draggable in the Phase
  view (per `add-phase-lane-view-toggle` non-goals).
- **No editing of `agents.yaml` from the card** — clicking the agent
  name doesn't jump to Settings. Optional future improvement.
- **No sound / desktop notification** on job completion. That's
  Phase 6.3 (`add-desktop-notifications`, pending, out of this trio).
