## ADDED Requirements

### Requirement: Kanban card annotates worker job state

Every Kanban card (rendered by the shared `<KanbanCard>` component in both Board and Phase views) SHALL display a per-change worker-state indicator derived from the Job registry. The indicator SHALL reflect the current or most-recently-completed Job's status for that change:

- `running` — animated pulse dot (accent color) + agent name + elapsed time (`formatElapsed(now - job.startedAt)`), refreshed every 30 seconds.
- `completed` — static gray checkmark + "done" label, shown only while BOTH conditions hold: (a) the card renders within 30 seconds of `finishedAt`, AND (b) the change still sits in the pipeline stage its worker finished in. When either fails the indicator SHALL fall back to its idle branch.
- `cancelled` — muted gray dot + "cancelled" label.
- `crashed` — red dot + "crashed" label; hover tooltip shows the exit code.
- `orphaned` — red dot + "orphaned" label; hover tooltip shows the worktree path.
- No job (idle) — behavior depends on `laneContext`:
  - `laneContext === "phase"` → muted queued dot + "queued" label
  - `laneContext === "board"` → indicator SHALL render nothing (no annotation)

The indicator SHALL be visible in both view modes without duplicating logic — it lives inside the shared `<KanbanCard>` and receives `laneContext` as a prop from its parent.

The `completed` state is transient in the workflow sense, not only the clock sense: the "done ✓" reports "a worker finished and the Manager has not yet acted". The Manager's act is the phase advance, so the indicator SHALL receive a stage signal — the change's current pipeline stage plus the stage it occupied when that job finished — and SHALL suppress `completed` as soon as the two differ, regardless of remaining grace time. A card that has already moved to its next lane SHALL NOT keep reporting `done`. This rule applies in both view modes (it is derived from `change.phase`, not from the board slot). When the at-finish stage is unknown (the job was already `completed` when the client loaded, so no transition was observed), the 30-second window alone governs.

Finished-job data (status `completed`/`cancelled`/`crashed`/`orphaned` with a `finishedAt` timestamp) SHALL be retained in the client's `jobByChange` map for at least the 30-second grace window post-finish so the indicator can render the just-finished state. The transience of the `completed` annotation SHALL be enforced at render time (grace window + stage signal) rather than by evicting the map entry — the same entry drives the Merge / View diff / Discard affordances, which must outlive the annotation.

No new server endpoints or WS events are introduced; the indicator derives entirely from the existing `JobSummary` data flow.

#### Scenario: Running worker shows pulse + elapsed
- **GIVEN** a `code`-role worker is running on change `X` with `job.startedAt` 45 seconds ago
- **WHEN** the Kanban view renders
- **THEN** card `X` shows an animated pulse dot (accent color) + agent name + `"45s"` elapsed
- **AND** the elapsed value updates roughly every 30 seconds

#### Scenario: Successful completion shows transient checkmark
- **GIVEN** a worker on change `Y` has just transitioned from `running` to `completed`
- **AND** change `Y` is still in the pipeline stage its worker finished in (the Manager has not advanced `phase` yet)
- **WHEN** the card renders within 30 seconds of `finishedAt`
- **THEN** card `Y` shows a gray checkmark + "done" label
- **AND** after 30 seconds the indicator reverts to base (no annotation in Board view, "queued" in Phase view)

#### Scenario: Phase advance retires the checkmark early
- **GIVEN** a worker on change `Y` completed 5 seconds ago and its card shows the "done" checkmark
- **WHEN** the Manager advances change `Y`'s phase (e.g. `proposed` → `coded`) and the card re-renders
- **THEN** card `Y` SHALL no longer show the checkmark, even though the 30-second window has not lapsed
- **AND** the card reverts to base (no annotation in Board view, "queued" in Phase view) in its new lane
- **AND** the Merge / View diff / Discard affordances, which are driven by the job rather than by this indicator, remain available

#### Scenario: Crash renders red badge with tooltip
- **GIVEN** a worker on change `Z` has status `crashed` with `exitCode: 137`
- **WHEN** the card renders
- **THEN** card `Z` shows a red dot + "crashed" label
- **AND** the hover tooltip shows `"exit code: 137"`

#### Scenario: Idle change in Phase view shows queued
- **GIVEN** a change has no annotatable Job state (never dispatched, finished > 30 s ago, or finished in a stage the change has since left) AND the Phase view is active
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
