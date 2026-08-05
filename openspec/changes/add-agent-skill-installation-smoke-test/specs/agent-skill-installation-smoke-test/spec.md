## ADDED Requirements

### Requirement: Opt-in Agent skill installation smoke test

The system SHALL provide an opt-in test harness that selects a `probe`-role
Agent from `agents.yaml`, initializes an isolated project through the normal
selected-CLI initialization path, starts that Agent through the normal runner
environment, and requests execution of the `ithy-opsx-test-probe` skill.

The live smoke test SHALL NOT run as part of the default unit-test command and
SHALL require an explicit environment gate.

#### Scenario: Configured Agent executes the installed probe
- **GIVEN** `agents.yaml` contains an Agent whose roles include `probe`
- **AND** the live-test environment gate is enabled
- **WHEN** the Agent skill smoke test runs for that Agent
- **THEN** it initializes a temporary project for the Agent's CLI
- **AND** launches the Agent with the project-local skill environment
- **AND** validates the nonce-bearing probe artifact

#### Scenario: Live test is not explicitly enabled
- **GIVEN** the live-test environment gate is absent
- **WHEN** the default test suite runs
- **THEN** no model-backed Agent CLI is started
- **AND** no authentication, network access, or model usage is required

### Requirement: Claude-authoritative probe definition

The canonical `ithy-opsx-test-probe` instructions SHALL be authored in the
Claude skill surface. The smoke harness SHALL rely on the normal
initialization/rendering path to materialize the selected Agent CLI's skill and
SHALL NOT maintain an independently authored target-CLI probe body.

This requirement SHALL NOT promote an existing command or prompt into a skill
and SHALL NOT modify the command/prompt/skill source-of-truth policy.

#### Scenario: Codex probe uses generated skill
- **GIVEN** the selected probe Agent command is `codex`
- **WHEN** the isolated project is initialized
- **THEN** the Codex probe skill is derived from the Claude-authoritative probe
- **AND** the harness does not write a separate hand-authored Codex skill body

### Requirement: Artifact-based success contract

The probe skill SHALL write a JSON artifact containing a schema version, probe
name, configured Agent name, unpredictable test nonce, and exact status
`recognized`. The harness SHALL determine success from this artifact rather
than from Agent stdout or subprocess exit code alone.

#### Scenario: Valid artifact passes
- **GIVEN** the Agent subprocess exits successfully
- **AND** the probe artifact contains the expected Agent name and nonce
- **AND** its status is exactly `recognized`
- **WHEN** the harness evaluates the run
- **THEN** it reports the skill installation smoke test as passed

#### Scenario: Exit zero without artifact fails
- **GIVEN** the Agent subprocess exits with status zero
- **BUT** no parseable probe artifact exists
- **WHEN** the harness evaluates the run
- **THEN** it reports failure with a missing-artifact diagnostic

### Requirement: Layered failure diagnostics

The harness SHALL distinguish configuration, initialization, expected skill
path, subprocess startup/timeout, and artifact validation failures. A missing
or unusable skill SHALL not be reported as a generic successful Agent exit.

#### Scenario: Expected skill file is absent
- **GIVEN** initialization completes
- **BUT** the expected selected-CLI probe skill path does not exist
- **WHEN** the harness reaches its pre-spawn validation
- **THEN** it fails without spawning the Agent
- **AND** reports the expected relative skill path

#### Scenario: Agent times out
- **GIVEN** the configured Agent starts but does not finish within the bounded timeout
- **WHEN** the timeout expires
- **THEN** the harness terminates the test subprocess
- **AND** reports the Agent name and timeout stage
