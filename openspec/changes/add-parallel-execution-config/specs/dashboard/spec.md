# Delta: dashboard — parallel execution config + Settings tab

## ADDED Requirements

### Requirement: Parallel Execution Config Flag

The system SHALL accept an optional top-level `parallelExecution:
boolean` field in `agents.yaml` (default `false` when absent). The
value SHALL be exposed to clients via the existing `GET
/api/agents/config` response payload.

#### Scenario: absent flag defaults to false
- **GIVEN** an `agents.yaml` without a `parallelExecution` key
- **WHEN** `GET /api/agents/config` responds
- **THEN** the response includes `parallelExecution: false`

#### Scenario: true is round-tripped
- **GIVEN** an `agents.yaml` containing `parallelExecution: true`
- **WHEN** the registry loads
- **THEN** `GET /api/agents/config` returns `parallelExecution: true`

#### Scenario: non-boolean value rejected
- **GIVEN** an `agents.yaml` with `parallelExecution: "maybe"`
- **WHEN** the registry loads
- **THEN** the load reports `parallelExecution must be a boolean` in the config error banner

### Requirement: Start Flow Consumes Config Instead Of Picker

The Kanban Start button and the ChangeDetail Start button SHALL
select an execution mode without opening the ExecutionPicker modal.
Resolution order:

1. `change.proposal.execution` (a per-change frontmatter override) —
   used verbatim if present
2. `parallelExecution` config value — `true` selects worktree mode,
   `false` selects terminal mode

Prerequisite failures (no `agents.yaml`, `!gitStatus.isRepo`, no
commits, embedded terminal unavailable) SHALL surface as toast
notifications instead of a picker fallback.

#### Scenario: config false selects terminal
- **GIVEN** `parallelExecution: false` and a change with no `proposal.execution` override
- **WHEN** the user clicks Start
- **THEN** the flow injects `/opsx:apply <id>` into the embedded terminal without opening a picker

#### Scenario: config true selects worktree
- **GIVEN** `parallelExecution: true` and no per-change override
- **WHEN** the user clicks Start
- **THEN** the flow spawns the agent inside `.worktrees/<id>/` without opening a picker

#### Scenario: per-change override wins
- **GIVEN** `parallelExecution: false` and a change with `proposal.execution: worktree`
- **WHEN** the user clicks Start
- **THEN** the flow uses worktree mode (override wins), no picker opens

#### Scenario: unmet prerequisites surface via toast
- **GIVEN** `parallelExecution: true` and `gitStatus.hasCommits === false`
- **WHEN** the user clicks Start
- **THEN** a toast reports the missing prerequisite and no picker opens

### Requirement: Settings Tab

The dashboard SHALL expose a `Settings` tab in the top navigation,
routed at `/settings`, that renders a small form for user-editable
config. The form SHALL include, at minimum, a `Parallel execution`
checkbox bound to the `parallelExecution` config value. Toggling the
checkbox SHALL persist through `POST /api/config/parallel-execution`
and broadcast an `agents-updated` event so other tabs see the fresh
value.

#### Scenario: toggle persists
- **GIVEN** `parallelExecution: false` in `agents.yaml`
- **WHEN** the user opens `/settings` and toggles Parallel execution to on
- **THEN** `agents.yaml` on disk contains `parallelExecution: true` and other keys are unchanged

#### Scenario: broadcast propagates
- **WHEN** a client posts `/api/config/parallel-execution` with `{ value: true }`
- **THEN** the server writes the file AND emits an `agents-updated` WS event carrying the new config

#### Scenario: non-local origin rejected
- **WHEN** a non-local address posts `/api/config/parallel-execution`
- **THEN** the server responds 403
