## ADDED Requirements

### Requirement: Runtime Definitions In agents.yaml

The system SHALL accept a `runtimes:` section in `agents.yaml` that
declares reusable runtime configurations. Each entry SHALL define
`command`, `baseArgs`, `promptStyle`, optional `promptFlag`, and a
`supports` object describing runtime capabilities. Unknown fields or
unknown enum values SHALL be rejected at load time with an error
banner in the dashboard.

#### Scenario: valid runtime section parsed
- **GIVEN** `agents.yaml` contains a `runtimes:` entry `claude` with `command`, `baseArgs`, `promptStyle: cli-arg`, `promptFlag: -p`, and `supports: { interactive: true, artifactOutput: true, diff: git }`
- **WHEN** the registry loads
- **THEN** the resolved config contains `runtimes.claude` with those exact values

#### Scenario: unknown promptStyle rejected
- **GIVEN** a `runtimes:` entry with `promptStyle: elsewhere`
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the invalid enum value and the dashboard surfaces the error banner while retaining the last-known-good agents list

#### Scenario: unknown supports.diff rejected
- **GIVEN** a `runtimes:` entry with `supports.diff: unknown-strategy`
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the invalid enum value

#### Scenario: missing command rejected
- **GIVEN** a `runtimes:` entry without a `command` field
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the missing field

#### Scenario: agents.yaml without a runtimes section
- **GIVEN** an `agents.yaml` that has no `runtimes:` key
- **WHEN** the registry loads
- **THEN** the load succeeds and `runtimes` is an empty object; legacy agents continue to function

### Requirement: Runtime-Backed Agents

The system SHALL support runtime-backed agent definitions that use
`runtime` + `prompt` fields as an alternative to `command` + `args`.
When a runtime-backed agent is spawned, the system SHALL look up the
referenced runtime, apply template substitution to the prompt
(`${change_id}`, `${worktree_path}`, `${branch}`), and construct the
effective command line according to the runtime's `promptStyle`:

- `promptStyle: cli-arg`: `[...runtime.baseArgs, ...(promptFlag ? [promptFlag] : []), resolvedPrompt]`
- `promptStyle: stdin`: `[...runtime.baseArgs]` with the resolved prompt delivered via the spawn's stdin (as `initialInput`)
- `promptStyle: file`: reserved for a future change; the runner SHALL throw a clear "not yet supported" error

Each agent SHALL provide EXACTLY ONE of `runtime`+`prompt` or
`command`+`args`; providing both or providing partial combinations
SHALL be rejected at load time.

#### Scenario: runtime-backed agent resolves via cli-arg with promptFlag
- **GIVEN** an agent `{ runtime: claude, prompt: "/opsx:apply add-foo" }` and a runtime `claude` with `baseArgs: [--dangerously-skip-permissions]`, `promptStyle: cli-arg`, `promptFlag: -p`
- **WHEN** the runner resolves the agent for change `add-foo`
- **THEN** the resolved command is `claude` with args `[--dangerously-skip-permissions, -p, /opsx:apply add-foo]`

#### Scenario: runtime-backed agent resolves via stdin
- **GIVEN** an agent `{ runtime: copilot, prompt: "review this diff" }` and a runtime `copilot` with `baseArgs: [copilot, suggest]`, `promptStyle: stdin`
- **WHEN** the runner resolves the agent
- **THEN** the resolved command is `gh` with args `[copilot, suggest]` and the resolved `initialInput` equals `"review this diff"`

#### Scenario: template substitution inside prompt
- **GIVEN** an agent with `prompt: "Implement ${change_id} in ${worktree_path}"`
- **WHEN** the runner resolves the agent for change `add-foo` with worktree `.worktrees/pool-2`
- **THEN** the resolved prompt reads `Implement add-foo in .worktrees/pool-2`

#### Scenario: mutual exclusion — runtime plus command rejected
- **GIVEN** an agent that declares both `runtime: claude` and `command: aider`
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the mutually exclusive fields

#### Scenario: mutual exclusion — runtime without prompt rejected
- **GIVEN** an agent that declares `runtime: claude` but no `prompt`
- **WHEN** the registry loads
- **THEN** the load fails with an error requiring `prompt` alongside `runtime`

#### Scenario: unknown runtime reference
- **GIVEN** an agent that declares `runtime: nowhere` and `runtimes:` has no entry named `nowhere`
- **WHEN** the runner attempts to resolve the agent
- **THEN** an error is raised naming the unknown runtime and no child process is spawned

### Requirement: Backward Compatibility With Command-Based Agents

Agents that use the pre-Phase-3 `command` + `args` shape SHALL continue
to spawn and resolve identically to their behavior before this change.
The registry SHALL treat `command` + `args` agents and `runtime` +
`prompt` agents as coexisting first-class citizens; adding a
`runtimes:` section SHALL NOT change the behavior of existing agents.

#### Scenario: existing agent still spawns
- **GIVEN** the repo's current `agents.yaml` containing a single agent `claude` with `command: claude` and `args: [--dangerously-skip-permissions, -p, /ithy-opsx:apply ${change_id}]`
- **WHEN** the registry loads
- **THEN** the load succeeds even if `runtimes:` is absent, and the runner resolves the agent to `claude` + `[--dangerously-skip-permissions, -p, /ithy-opsx:apply add-foo]` for change `add-foo`

#### Scenario: mixed agents.yaml
- **GIVEN** an `agents.yaml` with a `runtimes.claude` entry, a legacy agent using `command + args`, and a runtime-backed agent using `runtime + prompt`
- **WHEN** the registry loads
- **THEN** both agents are listed in `publicConfig()` and each resolves independently via its own path
