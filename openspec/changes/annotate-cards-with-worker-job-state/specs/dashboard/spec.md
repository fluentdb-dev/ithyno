## ADDED Requirements

### Requirement: Kanban card annotates worker job state

Every Kanban card (rendered by the shared `<KanbanCard>` component in both Board and Phase views) SHALL display a per-change worker-state indicator derived from the Job registry. The indicator SHALL reflect the current or most-recently-completed Job's status for that change:

- `running` — animated pulse dot (accent color) + agent name + elapsed time (`formatElapsed(now - job.startedAt)`), refreshed every 30 seconds.
- `completed` — static gray checkmark + "done" label, visible for up to 30 seconds after `finishedAt` before fading from the store.
- `cancelled` — muted gray dot + "cancelled" label.
- `crashed` — red dot + "crashed" label; hover tooltip shows the exit code.
- `orphaned` — red dot + "orphaned" label; hover tooltip shows the worktree path.
- No job (idle) — behavior depends on `laneContext`:
  - `laneContext === "phase"` → muted queued dot + "queued" label
  - `laneContext === "board"` → indicator SHALL render nothing (no annotation)

The indicator SHALL be visible in both view modes without duplicating logic — it lives inside the shared `<KanbanCard>` and receives `laneContext` as a prop from its parent.

Finished-job data (status `completed`/`cancelled`/`crashed`/`orphaned` with a `finishedAt` timestamp) SHALL be retained in the client's `jobByChange` map for a 30-second grace window post-finish so the indicator can render the just-finished state before the map drops the entry.

No new server endpoints or WS events are introduced; the indicator derives entirely from the existing `JobSummary` data flow.

#### Scenario: Running worker shows pulse + elapsed
- **GIVEN** a `code`-role worker is running on change `X` with `job.startedAt` 45 seconds ago
- **WHEN** the Kanban view renders
- **THEN** card `X` shows an animated pulse dot (accent color) + agent name + `"45s"` elapsed
- **AND** the elapsed value updates roughly every 30 seconds

#### Scenario: Successful completion shows transient checkmark
- **GIVEN** a worker on change `Y` has just transitioned from `running` to `completed`
- **WHEN** the card renders within 30 seconds of `finishedAt`
- **THEN** card `Y` shows a gray checkmark + "done" label
- **AND** after 30 seconds the indicator reverts to base (no annotation in Board view, "queued" in Phase view) as `jobByChange` drops the entry

#### Scenario: Crash renders red badge with tooltip
- **GIVEN** a worker on change `Z` has status `crashed` with `exitCode: 137`
- **WHEN** the card renders
- **THEN** card `Z` shows a red dot + "crashed" label
- **AND** the hover tooltip shows `"exit code: 137"`

#### Scenario: Idle change in Phase view shows queued
- **GIVEN** a change has no Job entry (never dispatched or fully finished > 30 s ago) AND the Phase view is active
- **WHEN** the card renders
- **THEN** the card shows a muted queued dot + "queued" label

#### Scenario: Idle change in Board view shows nothing
- **GIVEN** a change has no Job entry AND the Board view is active
- **WHEN** the card renders
- **THEN** the card renders no worker-state indicator (empty slot)

#### Scenario: Card render identity between views
- **GIVEN** the same change `W` appears in both the Board view and the Phase view (via toggle switching)
- **WHEN** each view renders `W`
- **THEN** the same `<KanbanCard>` component instance renders in both contexts
- **AND** the only difference in output is the `laneContext`-driven idle branch
