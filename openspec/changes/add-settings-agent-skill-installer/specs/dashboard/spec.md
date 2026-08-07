## ADDED Requirements

### Requirement: Settings Agent CLI Skill Controls

The Settings Prerequisites table SHALL display project-local OpenSpec and
ithyno skill state on every supported Agent CLI row. A `Manage skills` button
SHALL be available when that Agent CLI executable is installed. When the
executable is missing, both skill components SHALL be displayed as unsupported.

These controls SHALL be attached to the existing Agent CLI rows and SHALL NOT
add separate OpenSpec or ithyno prerequisite rows.

#### Scenario: Skill state appears on every Agent CLI row
- **GIVEN** Settings has loaded doctor results and Agent skill state
- **WHEN** the Prerequisites table renders
- **THEN** every Agent CLI row displays separate OpenSpec and ithyno states
- **AND** each row whose Agent CLI executable is installed displays a `Manage skills` button
- **AND** a row whose Agent CLI executable is missing does not display the button
- **AND** tmux, agmsg, git, and node rows do not display Agent skill controls

#### Scenario: CLI and skill state remain distinct
- **GIVEN** the Codex CLI is installed but the current project lacks Codex-specific ithyno skills
- **WHEN** Settings renders
- **THEN** the CLI executable is displayed as installed
- **AND** ithyno skills are independently displayed as missing

#### Scenario: Skill inspection fails
- **GIVEN** the Agent skill inspection API fails
- **WHEN** Settings renders
- **THEN** Agent CLI doctor results remain visible
- **AND** skill state is displayed as unknown with a refresh action

### Requirement: Agent CLI Skill Install Dialog

Clicking `Manage skills` SHALL open a dialog dedicated to the selected Agent
CLI. The dialog MUST display the CLI, current project root, separate OpenSpec
and ithyno states, component selection, planned project-local output locations,
and Install and Cancel actions.

The dialog SHALL display progress and per-component results and SHALL identify
a single-component failure as a partial result.

#### Scenario: Open the dialog from an Agent row
- **GIVEN** the user is viewing the Codex row
- **WHEN** the user clicks `Manage skills`
- **THEN** a dialog opens with Codex as its target
- **AND** OpenSpec and ithyno are selected by default
- **AND** the dialog states that output remains under the current project

#### Scenario: Install only one component
- **GIVEN** the user deselects OpenSpec and leaves only ithyno selected
- **WHEN** the user clicks Install
- **THEN** the request contains the selected CLI and ithyno component only
- **AND** OpenSpec initialization does not run

#### Scenario: Skills are unavailable before the CLI executable
- **GIVEN** doctor reports that the selected Agent CLI executable is missing
- **WHEN** Settings renders the Agent CLI row
- **THEN** OpenSpec and ithyno skill state are displayed as unsupported
- **AND** the `Manage skills` button is not displayed
- **AND** project-local skill installation cannot be started for that CLI

#### Scenario: Display a per-component partial failure
- **GIVEN** OpenSpec installation succeeds and the ithyno renderer fails
- **WHEN** SSE execution completes
- **THEN** the dialog displays the aggregate result as partial
- **AND** it displays OpenSpec as successful and ithyno as failed
- **AND** it displays the failure reason and a retry action

#### Scenario: Refresh Settings state after completion
- **GIVEN** at least one selected component installs successfully
- **WHEN** dialog execution completes
- **THEN** the client refetches Agent skill state
- **AND** the selected row updates without a full-page reload
