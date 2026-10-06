## ADDED Requirements

### Requirement: Allow-listed CLI capability inspection

The system SHALL inspect supported Agent CLIs through an allow-listed adapter for Claude Code, Codex, Antigravity CLI, and GitHub Copilot CLI. Inspection SHALL report the installed version, supported structured options, model-discovery status, and any discovered models without accepting an arbitrary probe command from the client.

#### Scenario: Supported CLI is inspected
- **WHEN** the Agent dialog requests capabilities for an installed recognized CLI
- **THEN** the server executes only the adapter-defined version, help, and optional model-list argv
- **AND** returns the installed version and the builder fields supported by that CLI version

#### Scenario: Unknown command is selected
- **WHEN** an Agent command does not map to an allow-listed adapter
- **THEN** the system reports that structured inspection is unsupported
- **AND** the user can continue using manual Advanced args

### Requirement: Bounded non-blocking discovery

Every CLI inspection process MUST run without a shell and SHALL have a timeout, output-size limit, and deterministic termination behavior. Inspection failure SHALL NOT prevent the Agent configuration from being saved manually.

#### Scenario: Model discovery hangs
- **WHEN** a CLI model-list command does not exit before its timeout
- **THEN** the server terminates the probe
- **AND** the dialog reports model discovery as unavailable
- **AND** manual model entry remains enabled

#### Scenario: CLI is not installed
- **WHEN** the selected recognized command cannot be resolved or executed
- **THEN** the dialog displays an executable-not-found state
- **AND** does not discard the Agent's existing command or arguments

### Requirement: Account-aware model selection with manual fallback

The command builder SHALL use models returned by the installed CLI when a verified non-interactive discovery mechanism exists. When it does not exist or fails, the builder SHALL provide editable manual model entry and show the adapter's CLI-specific model inspection guidance rather than presenting a hard-coded list as authoritative.

#### Scenario: Agy returns models
- **WHEN** `agy models` succeeds for the selected Agy executable
- **THEN** the model selector offers the returned models
- **AND** selecting one serializes it with Agy's supported model flag

#### Scenario: CLI only exposes an interactive picker
- **WHEN** the selected CLI has no verified non-interactive model-list mechanism
- **THEN** the model field accepts a manually entered model name
- **AND** the dialog identifies the CLI's interactive model inspection command

### Requirement: CLI-specific structured argument builder

The Agent dialog SHALL provide structured controls for the installed CLI's supported model, reasoning or effort, approval or permission, sandbox, and other adapter-defined options. Unsupported controls SHALL be omitted or disabled rather than serialized speculatively.

#### Scenario: Installed CLI supports a field
- **WHEN** help probing confirms the adapter's flag is supported
- **THEN** the corresponding control is enabled
- **AND** its selected value is serialized to the CLI's correct argv form

#### Scenario: Installed version lacks a field
- **WHEN** help probing does not find a field's required flag
- **THEN** the corresponding structured control is not selectable
- **AND** the builder does not add that flag

#### Scenario: Dangerous unattended mode is selected
- **WHEN** the user selects an option that bypasses approval or sandbox protections
- **THEN** the UI clearly identifies the security impact before save
- **AND** the option is not selected by default

### Requirement: Lossless existing argument round trip

The builder SHALL parse recognized options from the existing `args[]`, preserve unrecognized arguments in their original order and value, and merge edited recognized options without silently removing unrelated arguments.

#### Scenario: Existing args mix known and unknown options
- **GIVEN** an Agent has recognized model arguments and additional unknown argv elements
- **WHEN** the user changes only the model and saves
- **THEN** the model arguments are replaced with the selected model
- **AND** every unknown argv element remains present in its original relative order

#### Scenario: Conflicting recognized options exist
- **WHEN** existing args contain duplicate or conflicting values for a structured field
- **THEN** the dialog surfaces the conflict
- **AND** requires an explicit resolved value or an unchanged manual save rather than silently choosing one

### Requirement: Dispatcher-owned arguments remain excluded

The command builder MUST NOT persist non-interactive prompt transport, change identifiers, artifact contracts, or other arguments that the Agent registry and runner add for an invocation.

#### Scenario: Worker configuration is saved
- **WHEN** a user saves a single-prompt worker through the builder
- **THEN** `agents.yaml` contains only user-selected launch options in `args[]`
- **AND** prompt delivery remains the responsibility of the existing runtime resolver

### Requirement: Exact argv preview and compatible persistence

The dialog SHALL show the command and persisted argv that will be written. Saving SHALL continue to use the existing `agents.yaml` `command` and `args[]` schema so existing runners and manually authored configurations remain compatible.

#### Scenario: Structured selection is previewed and saved
- **WHEN** the user changes a builder field
- **THEN** the exact persisted argv preview updates before save
- **AND** saving writes the same argv elements through the existing Agent config endpoint

#### Scenario: Unsupported CLI uses manual args
- **WHEN** the command has no adapter
- **THEN** the user can edit argv manually
- **AND** the saved Agent remains executable by the existing runner
