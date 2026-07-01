## ADDED Requirements

### Requirement: Execution Picker Modal
The system SHALL provide a picker modal that lets the user choose between
the terminal (`/opsx:apply` inject) and worktree (`git worktree` +
spawn) execution paths for a change, previews the exact command each
path will run, and disables options that are not currently available.

#### Scenario: Picker on start without frontmatter
- **WHEN** the user starts a change whose proposal has no `execution` field
- **THEN** the picker modal opens with both options and their previews

#### Scenario: Terminal option unavailable
- **WHEN** no embedded terminal is open and no VS Code Terminal is available in the current runtime
- **THEN** the picker's Terminal option is disabled with a hint explaining why

#### Scenario: Worktree option unavailable
- **WHEN** `agents.yaml` is empty or absent
- **THEN** the picker's Worktree option is disabled with a hint explaining why

#### Scenario: CLI mode + Terminal option
- **WHEN** the command style is CLI and the Terminal option is chosen
- **THEN** the option is disabled with the existing "Apply requires Claude Code" tooltip

### Requirement: Save Choice to Proposal
The picker SHALL offer a "Save to proposal" checkbox that, when checked,
writes the chosen mode as `execution: <mode>` into the proposal's YAML
frontmatter so future starts skip the picker.

#### Scenario: Save checked
- **WHEN** the user picks a mode with "Save to proposal" checked and confirms
- **THEN** the server writes / updates the `execution` line in the proposal's frontmatter and then dispatches the chosen path

#### Scenario: Save unchecked
- **WHEN** the user picks a mode with "Save to proposal" unchecked and confirms
- **THEN** the server dispatches without modifying the proposal, and the next start opens the picker again
