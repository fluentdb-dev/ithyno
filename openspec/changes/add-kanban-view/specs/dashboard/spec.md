## MODIFIED Requirements

### Requirement: Change Overview
The system SHALL present the Overview as a workflow-driven Kanban board with
three columns — TODO, IN-PROGRESS, DONE — derived from each change's task
progress, so the project's *in-flight* lifecycle is visible at a glance. The
previous flat card grid and separate Archive accordion are replaced by this
board. Archived changes live on their own page (see "Archived Page") because
their volume grows unbounded and they are read-only history, not workflow.

#### Scenario: TODO column membership
- **WHEN** an active change has `0/N` tasks complete
- **THEN** it appears in the TODO column

#### Scenario: IN-PROGRESS column membership
- **WHEN** an active change has more than zero and fewer than all tasks complete
- **THEN** it appears in the IN-PROGRESS column

#### Scenario: DONE column membership
- **WHEN** an active change has all tasks complete (`done == total > 0`)
- **THEN** it appears in the DONE column, signalling it is ready to archive

#### Scenario: Empty task list
- **WHEN** an active change has no tasks (`total == 0`)
- **THEN** it appears in the TODO column

### Requirement: Archived Page
The system SHALL provide a separate Archived page at `/archive` accessible from
the top navigation, listing every archived change with id, archive date, final
progress, and an outcome indicator. The page is the home for completed history;
the Overview board carries no archived items.

#### Scenario: Open the archived page
- **WHEN** the user clicks "Archive" in the top navigation
- **THEN** the dashboard navigates to /archive and shows every archived change in date-descending order

#### Scenario: Outcome indicator on the page
- **WHEN** an archived entry has `outcome.md`
- **THEN** its row displays a "✓ outcome" indicator

#### Scenario: Navigate to an archived change
- **WHEN** the user clicks an entry in the archive page
- **THEN** the dashboard navigates to /change/<id>, where the existing archived panel renders

## ADDED Requirements

### Requirement: Workflow Gestures
The system SHALL treat dragging a TODO card into IN-PROGRESS as a request to
apply, and clicking the Archive action on a DONE card as a request to archive.
Both gestures route through the existing command-confirm modal so nothing runs
without explicit acknowledgement.

#### Scenario: Drag TODO → IN-PROGRESS
- **WHEN** the user drops a TODO card onto the IN-PROGRESS column
- **THEN** the dashboard opens the command modal pre-filled with `/opsx:apply <id>` (or the CLI equivalent per the active command style) for the user to confirm

#### Scenario: Click Archive on a DONE card
- **WHEN** the user clicks the Archive action on a DONE card
- **THEN** the dashboard opens the command modal pre-filled with `/opsx:archive <id>` (or the CLI equivalent) for the user to confirm

#### Scenario: Invalid drag targets
- **WHEN** the user drags a card toward a column that is not a valid forward transition (e.g. DONE → TODO, or TODO → DONE skipping IN-PROGRESS)
- **THEN** the drop target shows a blocked state and the drop is rejected

#### Scenario: Apply has no CLI equivalent
- **WHEN** the active command style is `cli` and the user drags TODO → IN-PROGRESS
- **THEN** the modal opens with the Apply form disabled and the same tooltip as the Apply button (apply requires Claude Code)

### Requirement: Archive Guard for Missing Outcome
The system SHALL detect when a change has no `outcome.md` and SHALL warn the
user before sending the archive command, but SHALL NOT block the action.

#### Scenario: Outcome missing
- **WHEN** the user clicks Archive on a DONE card whose change has no `outcome.md`
- **THEN** the archive modal shows a one-line warning ("No outcome.md yet — write one before archiving") above the preview, while the Send button remains active

#### Scenario: Outcome present
- **WHEN** the user clicks Archive on a DONE card whose change carries an `outcome.md`
- **THEN** the modal opens without a warning

### Requirement: Overview Layout Switcher
The system SHALL let the user switch the Overview between the workflow Kanban
board and the previous card grid, and SHALL persist the choice across sessions.
This preserves the card-grid view for users who prefer it without complicating
the kanban itself.

#### Scenario: Default layout
- **WHEN** the user opens the dashboard for the first time
- **THEN** the Overview renders as the Kanban board

#### Scenario: Switch to cards
- **WHEN** the user clicks the layout toggle and selects "Cards"
- **THEN** the Overview re-renders as the previous card grid (active changes only) and the choice persists

#### Scenario: Persistence across reloads
- **WHEN** the user chose Cards and reloads the dashboard
- **THEN** the Overview opens in the Cards layout

### Requirement: + New Change Moves to TODO Column
The system SHALL anchor the "+ New Change" action at the TODO column header,
since that is where the new change will appear.

#### Scenario: Trigger from the TODO column
- **WHEN** the user clicks "+ New Change" in the TODO column header
- **THEN** the existing New Change modal opens unchanged
