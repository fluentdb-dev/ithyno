## ADDED Requirements

### Requirement: Unified Start Action
The system SHALL treat the Kanban drag from TODO to IN-PROGRESS and the
card's start button as the same action, both invoking a single
`startImplementation` handler that chooses its execution path from the
proposal's `execution` field.

#### Scenario: Explicit worktree execution
- **WHEN** the user drags a card whose proposal declares `execution: worktree`, or clicks its Start button
- **THEN** the dashboard invokes the worktree spawn path (equivalent to the previous Run behavior) without asking

#### Scenario: Explicit terminal execution
- **WHEN** the user drags a card whose proposal declares `execution: terminal`, or clicks its Start button
- **THEN** the dashboard opens the confirm modal with `/opsx:apply <id>` (or the CLI equivalent per the active command style)

#### Scenario: Unset execution
- **WHEN** the user drags or clicks a card whose proposal does not declare `execution`
- **THEN** the dashboard opens the execution picker (see ui-orchestration spec) instead of dispatching directly

### Requirement: Start Button Rename
The system SHALL label the unified action **Start** on kanban cards,
replacing the previous **Run** wording, so the vocabulary reflects the
unified semantics.

#### Scenario: Card action label
- **WHEN** a card exposes the start action
- **THEN** its button label is "Start"

#### Scenario: Verify-only cards
- **WHEN** the `hide-run-on-verify-only` rule applies to a card
- **THEN** neither the Start button nor the drag-driven dispatch fires — the "verify only" hint replaces both
