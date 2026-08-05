## ADDED Requirements

### Requirement: Project-local Agent Skill Status Inspection

The system SHALL provide an API that independently inspects OpenSpec and
ithyno skills for every supported Agent CLI in the current project. For each
component, the result MUST include one of
`missing | partial | installed | update-available | unsupported`, diagnostics,
inspected paths, and an inspection timestamp.

ithyno state SHALL be determined by comparing project files with expected
content rendered from the universal sources. OpenSpec state SHALL be determined
by inspecting the expected paths for the selected tool adapter.

#### Scenario: ithyno output matches expected content
- **GIVEN** every ithyno skill output for the selected CLI exists and matches expected content
- **WHEN** skill state is inspected
- **THEN** the ithyno component is reported as installed

#### Scenario: Only some expected files exist
- **GIVEN** only some expected skill outputs for the selected CLI exist
- **WHEN** skill state is inspected
- **THEN** the affected component is reported as partial
- **AND** diagnostics identify the missing relative paths

#### Scenario: ithyno output is outdated
- **GIVEN** every expected path exists but at least one file differs from current renderer output
- **WHEN** skill state is inspected
- **THEN** the ithyno component is reported as update-available

#### Scenario: Inspect an unsupported CLI
- **WHEN** a request specifies an unsupported CLI identifier
- **THEN** the API returns HTTP 400
- **AND** it does not inspect arbitrary paths

### Requirement: Settings-triggered Per-CLI Skill Installation

The system SHALL provide an authenticated local API that installs skills for
one selected Agent CLI. The API accepts one or more of the `openspec` and
`ithyno` components from Settings and writes them into the current project.

The OpenSpec component MUST use the bundled OpenSpec CLI's official tool
adapter, and the ithyno component MUST pass one renderer CLI to the existing
`installSkills()` implementation. Processing SHALL continue independently for
each component and stream progress and final results over SSE.

#### Scenario: Install OpenSpec and ithyno for Codex
- **GIVEN** the request specifies `codex` and `[openspec, ithyno]`
- **WHEN** installation runs
- **THEN** the OpenSpec Codex tool adapter writes into the current project
- **AND** the ithyno Codex renderer and required Codex migrations write into the same project
- **AND** no renderer for another CLI runs

#### Scenario: Repeat the same installation
- **GIVEN** OpenSpec and ithyno skills for the selected CLI are already current
- **WHEN** the same installation runs again
- **THEN** the operation succeeds
- **AND** byte-identical ithyno files are not modified unnecessarily

#### Scenario: Continue after one component fails
- **GIVEN** the OpenSpec subprocess exits with a non-zero status
- **AND** ithyno is also selected
- **WHEN** installation runs
- **THEN** the ithyno renderer still runs
- **AND** the final result reports the OpenSpec failure and ithyno result separately

#### Scenario: Reject a duplicate install for the same CLI
- **GIVEN** a Codex installation is already running in the current project
- **WHEN** a second Codex installation request arrives
- **THEN** the API returns HTTP 409
- **AND** it neither interrupts the active operation nor starts a duplicate

### Requirement: Agent Skill Installation Stays Within Project Boundary

Settings-triggered Agent skill inspection and installation MUST target only
the current project root held by the server. Requests MUST NOT supply an
arbitrary project path, output path, or executable, and the operation SHALL NOT
write to global Agent configuration or skill directories.

#### Scenario: Attempt to inject a path through the request
- **WHEN** a client sends a project path or output path in addition to CLI and components
- **THEN** the server does not use the supplied path
- **AND** every inspected and written path resolves from the current project root

#### Scenario: Install skills for Codex
- **GIVEN** the current project is `/work/project`
- **WHEN** Codex OpenSpec and ithyno installation completes
- **THEN** output exists under `/work/project/.codex/`
- **AND** `$CODEX_HOME`, `~/.codex/`, and all other global skill locations remain unchanged
