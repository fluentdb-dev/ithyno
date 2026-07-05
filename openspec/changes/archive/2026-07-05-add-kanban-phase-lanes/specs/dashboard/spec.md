## ADDED Requirements

### Requirement: Progress-Independent Phase Placement

The Kanban SHALL place each phased change into the swim lane matching
its `change.phase` value regardless of its task-progress state. A
change in the `done` lane MAY have unfinished tasks; a change in the
`proposed` lane MAY have every task ticked. Only the Unphased fallback
section MAY consult the pre-existing `bucketize`-style todo /
inprogress / done grouping.

#### Scenario: phased change with incomplete tasks stays in its lane
- **GIVEN** a change with `phase: done` and `progress.done < progress.total`
- **WHEN** the Kanban renders
- **THEN** the change appears in the `done` phase lane, not in a progress-derived "in-progress" location
- **AND** the card's progress bar visibly shows the incomplete state

#### Scenario: phased change with all tasks ticked stays in its lane
- **GIVEN** a change with `phase: proposed` and `progress.done === progress.total > 0`
- **WHEN** the Kanban renders
- **THEN** the change appears in the `proposed` phase lane, not in a progress-derived "ready to archive" location
- **AND** the card SHALL NOT show the "ready to archive" dot that the legacy 3-column DONE column used

#### Scenario: unphased section may consult progress
- **GIVEN** an unphased change
- **WHEN** the Kanban renders it inside the Unphased section
- **THEN** the section MAY sub-group the change under todo / inprogress / done using the pre-existing bucketing rules
- **AND** this sub-grouping SHALL be strictly local to the Unphased section (no phased card ever consults progress for its top-level lane placement)
