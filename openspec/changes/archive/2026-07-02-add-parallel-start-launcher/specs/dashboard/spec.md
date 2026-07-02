## ADDED Requirements

### Requirement: IN-PROGRESS Column Start Launcher
The Kanban IN-PROGRESS column SHALL expose a header-level Start launcher
button — visually and semantically parallel to the TODO column's
`+ New Change` button — that opens a popover listing every change ready to
run and dispatches the shared start flow when one is picked, so users can
kick off parallel implementations without leaving the column they are
watching progress in.

#### Scenario: Launcher renders with count
- **WHEN** the IN-PROGRESS column mounts and there is at least one startable candidate
- **THEN** the header shows `Start ▾` with a candidate-count badge and the button is enabled

#### Scenario: Launcher renders disabled when there are no candidates
- **WHEN** every change is already running, completed, or has only verify-only work left
- **THEN** the launcher button is disabled with the reason `"Nothing startable — all changes are already running or have verify-only work left."`

#### Scenario: Launcher renders disabled when agents.yaml is empty
- **WHEN** `agents.length === 0`
- **THEN** the launcher button is disabled with the reason `"No agents in agents.yaml."`

#### Scenario: Popover lists startable candidates
- **WHEN** the user clicks the launcher and candidates exist
- **THEN** a popover anchored to the button lists each startable change with its id, tags summary, and current progress (`done/total`)

#### Scenario: Startable filter uses shared predicates
- **WHEN** the launcher computes its candidate list
- **THEN** it uses the same `hasNonVerifyWork` and `isRunningOrPending` predicates that the card-level Start button uses; the two agree on what counts as startable

#### Scenario: Pick dispatches through shared start flow
- **WHEN** the user picks a candidate
- **THEN** the launcher calls `useStartFlow().startImplementation(change)` — reading `proposal.execution` and either dispatching directly (worktree/terminal) or opening the ExecutionPicker — exactly as the card-level Start would

#### Scenario: Card visibly moves to IN-PROGRESS
- **WHEN** the picked change starts and the resulting job is running
- **THEN** the card renders in the IN-PROGRESS column (existing `bucketize` job-aware behavior) alongside any peers already running

#### Scenario: Popover dismissal
- **WHEN** the user clicks outside the popover or presses Escape
- **THEN** the popover closes and no start is triggered

#### Scenario: Parallel spawn permitted
- **WHEN** the user picks a candidate while another change already has a running job
- **THEN** the new change spawns its own worktree + agent process; both jobs run concurrently (no queueing or global lock)
