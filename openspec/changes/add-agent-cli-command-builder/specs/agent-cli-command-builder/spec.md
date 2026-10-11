## ADDED Requirements

### Requirement: Bundled CLI capability catalog

The system SHALL ship a checked-in JSON capability catalog for Claude Code, Codex, Antigravity CLI, and GitHub Copilot CLI. The catalog SHALL include the aliases, observed source version, supported structured fields, category/kind/choice metadata, danger metadata, model guidance, and any discoverable models for the developer snapshot used to create the bundle.

#### Scenario: Supported CLI is selected
- **WHEN** the Agent dialog requests capabilities for a supported command
- **THEN** the server reads the bundled catalog entry for that adapter
- **AND** returns the field metadata, category layout, and model suggestions without invoking any user-environment subprocesses

#### Scenario: Unknown command is selected
- **WHEN** an Agent command does not map to an allow-listed adapter
- **THEN** the system reports that structured inspection is unsupported
- **AND** the user can continue using the manual free-form args editor

### Requirement: Runtime catalog-only lookup

The runtime API and UI MUST read the generated catalog only. They MUST NOT spawn `claude`, `codex`, `agy`, `copilot`, `app-server`, or model-list commands while the dashboard is open or while the user edits an Agent command.

#### Scenario: Command builder opens
- **WHEN** the Agent dialog loads or changes the selected command
- **THEN** it resolves the static catalog entry from the bundled JSON
- **AND** it does not launch a process or inspect the local machine

#### Scenario: Catalog entry is absent
- **WHEN** the bundled JSON does not define a capability entry for the adapter
- **THEN** the runtime falls back to the unsupported-command behavior
- **AND** the user still retains the manual free-form args editor

### Requirement: Manual model entry remains valid

The command builder SHALL treat catalog model entries as suggestions rather than an entitlement, authorization, or guarantee of availability. The model field SHALL remain editable so users can override account-specific or provider-specific model names.

#### Scenario: Model list is stale
- **WHEN** the catalog includes a snapshot of models that do not match the current account or gateway state
- **THEN** the UI still allows manual model entry
- **AND** the model value is saved without forcing an explicit catalog authorization check

#### Scenario: CLI exposes interactive model guidance
- **WHEN** the catalog marks a CLI as manual or interactive for model discovery
- **THEN** the model field accepts a manually entered model name
- **AND** the dialog shows the CLI's guidance instead of implying that the catalog is authoritative

### Requirement: CLI-specific structured argument builder

The Agent dialog SHALL provide structured controls for the supported model, reasoning or effort, approval or permission, sandbox, execution, context, tools & access, and adapter-defined options using the canonical ordered groups Model, Reasoning, Permissions, Sandbox, Execution, Context, Tools & Access, Unattended / Dangerous, and Advanced. Unsupported or empty categories SHALL be omitted, and the builder SHALL use a deterministic category ordering when rendering controls.

#### Scenario: Catalog supports a field
- **WHEN** the bundled catalog identifies an adapter field
- **THEN** the corresponding control is enabled
- **AND** its selected value is serialized to the CLI's correct argv form
- **AND** the field appears under its category in the same deterministic order across adapters

#### Scenario: Installed version lacks a field
- **WHEN** a catalog entry omits a field or a future version removes it
- **THEN** the corresponding structured control is not selectable
- **AND** the builder does not add that flag
- **AND** the category is hidden when no supported fields remain for it

#### Scenario: Dangerous unattended mode is selected
- **WHEN** the user selects an option that bypasses approval or sandbox protections
- **THEN** the UI clearly identifies the security impact before save
- **AND** the option is placed in the dedicated Unattended / Dangerous section rather than mixed into Permissions or Sandbox
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

The structured groups SHALL expose a visible disclosure indicator. The free-form args editor SHALL remain separately editable, while the Advanced group SHALL present the exact command and argv as a read-only preview.

#### Scenario: Structured selection is previewed and saved
- **WHEN** the user changes a builder field
- **THEN** the exact persisted argv preview updates before save
- **AND** saving writes the same argv elements through the existing Agent config endpoint

#### Scenario: Unsupported CLI uses manual args
- **WHEN** the command has no adapter
- **THEN** the user can edit argv manually
- **AND** the saved Agent remains executable by the existing runner
