## ADDED Requirements

### Requirement: Manager-aware interactive command resolution

The system SHALL derive every agent-command string injected by an interactive
dashboard action or server Manager handoff from the active Manager's command.
For an active Codex Manager, OpenSpec operations SHALL use
`openspec-<operation>` and ithyno operations SHALL use `ithy-opsx-<operation>`.
For every other Manager, the system SHALL retain the respective `/opsx:` and
`/ithy-opsx:` slash-command syntax. When no Manager is configured, it SHALL
use the non-Codex fallback.

#### Scenario: Codex proposal dialog
- **GIVEN** the active Manager command is `codex`
- **WHEN** the user enters `test function helloworld` in Propose a new change
- **THEN** the dialog previews and injects
  `openspec-propose "test function helloworld"`

#### Scenario: non-Codex proposal dialog
- **GIVEN** the active Manager command is `claude`
- **WHEN** the user enters `test function helloworld` in Propose a new change
- **THEN** the dialog previews and injects
  `/opsx:propose "test function helloworld"`

### Requirement: Complete Manager command entry-point coverage

The following product actions SHALL use the Manager-aware resolver: Propose a
new change, Start/dispatch, Apply, Archive, Merge, and the server-side Import
handoff. Command previews and submit labels SHALL represent the resolved
command. CLI-mode variants that invoke `npx openspec` or `git` SHALL retain
their current behavior.

#### Scenario: Codex ithyno action
- **GIVEN** the active Manager command is `codex`
- **WHEN** the user initiates Archive for change `add-hello`
- **THEN** the dialog previews and injects `ithy-opsx-archive add-hello`

#### Scenario: Codex Import handoff
- **GIVEN** the active Manager command is `codex`
- **WHEN** the server hands off an Import target `/tmp/project` to the Manager
- **THEN** it injects `ithy-opsx-import /tmp/project`

#### Scenario: CLI action remains unchanged
- **GIVEN** the user selects CLI mode for Archive on `add-hello`
- **WHEN** the Archive dialog is opened
- **THEN** it retains `npx openspec archive add-hello`
