## ADDED Requirements

### Requirement: Diff Tab on Job Detail
The system SHALL add a "Diff" tab to the job detail view on the `/agents`
page alongside the existing live output, defaulting to Output for running
jobs and Diff for finished ones.

#### Scenario: Finished job opens to Diff
- **WHEN** the user opens a job whose status is `completed`, `cancelled`, or `crashed`
- **THEN** the Diff tab is selected by default and the diff renders

#### Scenario: Running job opens to Output
- **WHEN** the user opens a job whose status is `running`
- **THEN** the Output tab is selected by default; the Diff tab is still selectable but shows whatever has been committed so far

### Requirement: View Diff Action on Kanban Card
The system SHALL add a "View diff" action on kanban cards whose latest
agent job has finished, opening the corresponding job detail with the Diff
tab pre-selected.

#### Scenario: View diff from a card
- **WHEN** the user clicks "View diff" on a kanban card whose latest job is finished
- **THEN** the dashboard navigates to the job detail with the Diff tab active

#### Scenario: Stats summary on the card
- **WHEN** the card carries a finished-job diff
- **THEN** the action shows compact stats (e.g. `+12 −3 · 4 files`)

### Requirement: Diff Rendering
The system SHALL render unified diffs with context / addition / deletion
classification using distinct colors, file-tree navigation for multi-file
diffs, and per-file headers showing the path and change kind.

#### Scenario: Multi-file diff
- **WHEN** a diff touches more than one file
- **THEN** the UI renders a file tree on the left and the selected file's hunks on the right

#### Scenario: Single-file diff
- **WHEN** a diff touches exactly one file
- **THEN** the UI may omit the file tree and render the hunks alone

#### Scenario: Truncated file
- **WHEN** a file's diff is truncated server-side
- **THEN** the UI shows a footer ("truncated — view full diff in terminal") below the rendered hunks
