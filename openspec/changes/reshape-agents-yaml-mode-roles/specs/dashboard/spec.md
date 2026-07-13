# Delta: dashboard — collapse `shape` into `mode` + `roles[]`

## ADDED Requirements

### Requirement: Agent Mode Field

Every agent entry in `agents.yaml` SHALL declare a required `mode`
field with a value of `"single-prompt"` or `"live-shell"`. The
`mode` field SHALL control how the runner spawns the child process,
independent of whether the agent references a `runtime` or specifies
`command` directly.

- `single-prompt` — the runner spawns a headless child, delivers the
  resolved prompt according to the effective `promptStyle` (see
  `Runtime-Backed Agents`), captures stdout, and waits for exit.
- `live-shell` — the runner spawns a PTY, writes the resolved prompt
  followed by a newline to the child's stdin after boot, and keeps
  the session alive until the user detaches or the process exits.

Agents that omit `mode` SHALL be rejected at load time with an error
identifying the missing field. During load-time normalization of
pre-existing entries (see `Backward Compatibility With Command-Based
Agents`), a `mode` value SHALL be synthesized from the legacy shape's
observable behavior.

#### Scenario: mode single-prompt spawns headless
- **GIVEN** an agent with `mode: single-prompt`, `command: claude`, `args: [--dangerously-skip-permissions]`, and a resolved prompt `/opsx:apply add-foo`
- **AND** the effective `promptStyle` is `cli-arg` with `promptFlag: -p`
- **WHEN** the runner spawns the agent for change `add-foo`
- **THEN** the child is spawned with argv `[claude, --dangerously-skip-permissions, -p, /opsx:apply add-foo]` and no PTY is allocated

#### Scenario: mode live-shell spawns PTY
- **GIVEN** an agent with `mode: live-shell`, `command: claude`, `args: [--continue]`, and a resolved prompt `/opsx:manage`
- **WHEN** the runner spawns the agent
- **THEN** a PTY session starts running `claude --continue` and the string `/opsx:manage\n` is written to its stdin after the boot handshake

#### Scenario: missing mode rejected
- **GIVEN** an agent that omits the `mode` field entirely and cannot be normalized from a legacy shape
- **WHEN** the registry loads
- **THEN** the load fails with an error naming the missing field

### Requirement: Agent Roles Array

Every agent entry in `agents.yaml` SHALL declare a required
`roles: string[]` field with a non-empty array of role names.
Recognized role names are `code`, `review`, `verify`, `manager`, and
`other`; unknown role names SHALL be rejected at load time.

An agent whose `roles` array contains `manager` SHALL be treated as
the project's Manager and SHALL have `mode: live-shell`. The load
SHALL fail if more than one agent contains `manager` in `roles`
(Manager singleton constraint).

At dispatch time, an agent SHALL be considered a candidate for a
requested role if the request's scalar `role` is contained in the
agent's `roles` array (see `Agent Selection By Role And Specialties`).

#### Scenario: multi-role agent covers three worker roles
- **GIVEN** an agent `claude-worker` with `roles: [code, review, verify]`
- **WHEN** the client dispatches `{ role: "code", changeId: "add-foo" }` and later `{ role: "verify", changeId: "add-foo" }`
- **THEN** both dispatches select `claude-worker` (specialties and runtime filters allowing)

#### Scenario: manager singleton violated
- **GIVEN** an `agents.yaml` with two agents whose `roles` arrays both include `manager`
- **WHEN** the registry loads
- **THEN** the load fails with a "manager singleton violated" error naming both agents

#### Scenario: manager without live-shell rejected
- **GIVEN** an agent with `roles: [manager]` and `mode: single-prompt`
- **WHEN** the registry loads
- **THEN** the load fails with an error stating `mode` must be `live-shell` for manager agents

#### Scenario: unknown role name rejected
- **GIVEN** an agent with `roles: [code, docs]` (where `docs` is not a recognized role)
- **WHEN** the registry loads
- **THEN** the load fails with an error identifying `docs` as the unknown role

### Requirement: Per-Role Prompt Resolution

The system SHALL define per-role prompt resolution at dispatch time.
Both `runtimes:` entries and `agents:` entries MAY declare a
`prompts:` map keyed by role name whose values are prompt template
strings. Resolution order for a given `(agent, role)` pair:

1. `agent.prompts?.[role]` — highest priority
2. `runtimes[agent.runtime].prompts?.[role]` — when `agent.runtime` is set
3. Built-in default template for the role:
   - `code` → `/opsx:apply ${change_id}`
   - `review` → `/opsx:review ${change_id}`
   - `verify` → `/opsx:verify ${change_id}`
   - `manager` → `/opsx:manage`
   - `other` → no default; dispatch SHALL fail with a
     "no prompt configured for role `other`" error

After lookup, template substitution SHALL run on the resolved string
using `${change_id}`, `${worktree_path}`, and `${branch}` (same set
as today's `Runtime-Backed Agents`).

#### Scenario: agent-level prompt wins over runtime and default
- **GIVEN** an agent with `runtime: claude` and `prompts.code: "/custom-flow ${change_id}"`
- **AND** the runtime `claude` has `prompts.code: "/opsx:apply ${change_id}"`
- **WHEN** the client dispatches `{ role: "code", changeId: "add-foo" }`
- **THEN** the resolved prompt is `/custom-flow add-foo`

#### Scenario: runtime prompt used when agent omits override
- **GIVEN** an agent with `runtime: claude` and no `prompts` map
- **AND** the runtime `claude` has `prompts.review: "/opsx:review ${change_id}"`
- **WHEN** the client dispatches `{ role: "review", changeId: "add-foo" }`
- **THEN** the resolved prompt is `/opsx:review add-foo`

#### Scenario: built-in default used when no override at any level
- **GIVEN** an agent with no `runtime` reference and no `prompts` map
- **WHEN** the client dispatches `{ role: "verify", changeId: "add-foo" }`
- **THEN** the resolved prompt is `/opsx:verify add-foo`

#### Scenario: role other requires explicit prompt
- **GIVEN** an agent with `roles: [other]` and no `prompts.other`
- **WHEN** the client dispatches `{ role: "other", changeId: "add-foo" }`
- **THEN** the dispatch fails with a "no prompt configured for role other" error

### Requirement: Agents Config Modal Layout Ergonomics

The AgentConfigModal SHALL adapt its layout to the entry being edited
and to the size of the containing viewport so users can complete the
form without hunting for irrelevant controls or scrolling behind the
Save button.

**Manager-specific field visibility.** When the entry's `roles`
contains `manager`, the Modal SHALL hide the fields whose values are
fixed for Manager entries and cannot be usefully changed:

- The **Roles** multi-select SHALL be hidden; `roles` is force-set to
  `["manager"]` on submit.
- The **Mode** toggle SHALL be hidden; `mode` is force-set to
  `"live-shell"` on submit.
- The **Runtime** dropdown SHALL be hidden; Manager entries never
  inherit from a `runtimes:` block (the interactive PTY session
  doesn't compose meaningfully with shared-defaults inheritance).
- **Specialties**, **Concurrency**, and **Dedicated** SHALL be hidden;
  they are force-set to `[]`, `1`, and `true` respectively on submit
  because Manager is a singleton PTY that doesn't participate in
  dispatch routing, concurrency limits, or worktree pools.
- A **Manager** tag SHALL appear next to the modal title so the user
  can see at a glance that they're editing the Manager row.
- The Prompts fieldset SHALL render as singular ("Prompt") with a
  Manager-specific hint ("typed into the PTY after Manager boots").

Worker entries (any `roles` without `manager`) SHALL render all
fields normally.

**Advanced options — collapsible.** The Modal SHALL group the
non-essential fields (Runtime, Specialties, Concurrency, Dedicated,
Description) behind a `[▸ Advanced options]` disclosure. The section
SHALL start **collapsed** on Add mode and on Edit-mode entries whose
Advanced fields all hold their defaults. When any of those fields
holds a non-default value at open time, the section SHALL start
**expanded** so the user sees what they're editing. The disclosure
toggle SHALL preserve the current form state across expand / collapse
transitions (no field reset).

**Scroll.** The Modal SHALL cap its height at `90vh` and SHALL make
its form body scrollable. The Modal title and the Cancel / Save
action row SHALL remain pinned (non-scrolling) so the user can
always dismiss or submit without scrolling.

#### Scenario: Manager Modal hides worker-only fields
- **GIVEN** the user opens the Modal on the existing Manager entry (or via the Manager section's `[Declare in agents.yaml]` shortcut)
- **WHEN** the Modal renders
- **THEN** the Roles multi-select, Mode toggle, Runtime dropdown, Specialties input, Concurrency input, and Dedicated checkbox are ALL absent from the visible form
- **AND** a "MANAGER" tag appears next to the modal title
- **AND** the Prompts fieldset legend reads "Prompt" (singular) with a manager-specific hint

#### Scenario: Manager Modal submits with fixed values
- **GIVEN** the Manager Modal is open with only Name, Command, Args, and Prompt visible
- **WHEN** the user fills in `name: primary`, `command: claude`, `args: --continue`, `prompt: /opsx:manage`, and clicks Save
- **THEN** the payload sent to `/api/agents/config` includes `roles: ["manager"]`, `mode: "live-shell"`, `specialties: []`, `concurrency: 1`, `dedicated: true`
- **AND** the payload does NOT include a `runtime` field

#### Scenario: Worker Modal shows all fields
- **GIVEN** the user opens the Modal on a worker entry with `roles: [code]`
- **WHEN** the Modal renders
- **THEN** the Roles multi-select, Mode toggle, and (inside the Advanced disclosure) Runtime, Specialties, Concurrency, Dedicated, and Description are all present

#### Scenario: Advanced options start collapsed on Add mode
- **GIVEN** the user clicks `+ Add agent` (no existing agent seed)
- **WHEN** the Modal renders
- **THEN** the Advanced options section is collapsed; only its `[▸ Advanced options]` toggle is visible

#### Scenario: Advanced options auto-expand for non-default edits
- **GIVEN** an existing agent has `specialties: [area/web]` (a non-default value)
- **WHEN** the user opens the Modal via Edit on that row
- **THEN** the Advanced options section renders expanded so the specialties field is visible on open

#### Scenario: Advanced options toggle preserves state
- **GIVEN** the Advanced options section is expanded and the user has typed `concurrency: 3`
- **WHEN** the user clicks the toggle to collapse, then clicks it again to expand
- **THEN** the concurrency input still reads `3` (state is not reset by the toggle)

#### Scenario: Modal scrolls when content exceeds viewport
- **GIVEN** the user opens the Modal on a tall viewport where all fields fit at once
- **WHEN** the viewport is resized short enough that the fields would overflow
- **THEN** the Modal title stays pinned at the top and the Cancel / Save row stays pinned at the bottom
- **AND** the middle form section becomes scrollable so every field remains reachable

## MODIFIED Requirements

### Requirement: Runtime Definitions In agents.yaml

The system SHALL accept a `runtimes:` section in `agents.yaml` that
declares reusable runtime configurations. Each entry SHALL define
`command`, `baseArgs`, `promptStyle`, optional `promptFlag`, an
optional `prompts` map from role name to prompt template, and a
`supports` object describing runtime capabilities. Unknown fields
or unknown enum values SHALL be rejected at load time with an error
banner in the dashboard.

The `prompts` map on a runtime SHALL be a shared default for agents
that reference the runtime; per-role resolution rules are defined in
`Per-Role Prompt Resolution`.

#### Scenario: valid runtime section parsed
- **GIVEN** `agents.yaml` contains a `runtimes:` entry `claude` with `command`, `baseArgs`, `promptStyle: cli-arg`, `promptFlag: -p`, `prompts: { code: "/opsx:apply ${change_id}" }`, and `supports: { interactive: true, artifactOutput: true, diff: git }`
- **WHEN** the registry loads
- **THEN** the resolved config contains `runtimes.claude` with those exact values

#### Scenario: prompts field optional on runtime
- **GIVEN** a `runtimes:` entry without a `prompts` field
- **WHEN** the registry loads
- **THEN** the load succeeds and agents that reference this runtime fall back to built-in defaults during per-role resolution

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

The system SHALL support agent entries that reference a `runtime` name
to inherit shared defaults (`command`, `args`, `promptStyle`,
`promptFlag`, `prompts`) from the corresponding `runtimes:` entry.
Referencing a runtime is OPTIONAL — an agent MAY specify `command`
and `args` directly instead, and MAY override runtime-inherited
values by declaring them locally.

The `shape: legacy | runtime-backed` distinction from the original
Phase 3.1 spec is REMOVED. The runner branches on the agent's
`mode` field (see `Agent Mode Field`), not on which shape the agent
used to declare itself. Under `mode: single-prompt`, prompt delivery
follows the effective `promptStyle` inherited from the runtime (or
defaulted to `cli-arg` with `promptFlag: -p` when the agent specifies
`command` locally and provides no runtime):

- `promptStyle: cli-arg`: the runner unshifts `[promptFlag, resolvedPrompt]`
  before the effective `args` when constructing spawn argv
- `promptStyle: stdin`: the runner writes `resolvedPrompt` to
  `child.stdin` after spawn
- `promptStyle: file`: reserved for a future change; the runner
  SHALL throw a clear "not yet supported" error

Under `mode: live-shell`, `promptStyle` is IGNORED; the runner
always types the resolved prompt into the PTY after boot.

Template substitution (`${change_id}`, `${worktree_path}`,
`${branch}`) SHALL apply to the resolved prompt string, regardless
of `mode`.

#### Scenario: agent inherits command and args from runtime
- **GIVEN** a runtime `claude` with `command: claude` and `baseArgs: [--dangerously-skip-permissions]`
- **AND** an agent `{ runtime: claude, mode: single-prompt, roles: [code] }` without local `command` or `args`
- **WHEN** the runner spawns the agent for change `add-foo`
- **THEN** the spawn argv is `[claude, --dangerously-skip-permissions, -p, /opsx:apply add-foo]`

#### Scenario: agent overrides runtime args locally
- **GIVEN** a runtime `claude` with `baseArgs: [--dangerously-skip-permissions]`
- **AND** an agent `{ runtime: claude, args: [--continue], mode: live-shell, roles: [manager] }`
- **WHEN** the runner spawns the agent
- **THEN** a PTY is opened running `claude --continue`

#### Scenario: agent without runtime uses cli-arg defaults
- **GIVEN** an agent `{ command: aider, args: [--yes-always], mode: single-prompt, roles: [code], prompts: { code: "Implement ${change_id}" } }` with no `runtime` field
- **WHEN** the runner spawns the agent for change `add-foo`
- **THEN** the spawn argv is `[aider, --yes-always, -p, Implement add-foo]` (default `promptFlag: -p`)

#### Scenario: stdin promptStyle delivers via stdin
- **GIVEN** a runtime `copilot` with `command: gh`, `baseArgs: [copilot, suggest]`, `promptStyle: stdin`
- **AND** an agent `{ runtime: copilot, mode: single-prompt, roles: [code], prompts: { code: "review this diff" } }`
- **WHEN** the runner spawns the agent
- **THEN** the spawn argv is `[gh, copilot, suggest]` and `"review this diff"` is written to `child.stdin`

#### Scenario: unknown runtime reference
- **GIVEN** an agent that declares `runtime: nowhere` and `runtimes:` has no entry named `nowhere`
- **WHEN** the runner attempts to resolve the agent
- **THEN** an error is raised naming the unknown runtime and no child process is spawned

### Requirement: Backward Compatibility With Command-Based Agents

The system SHALL normalize pre-existing agent shapes into the new
`mode + roles + prompts` schema at load time so that users are not
required to migrate their `agents.yaml` on this release. The
following normalizations SHALL apply:

- `role: <name>` (scalar) SHALL be treated as `roles: [<name>]`.
- `initialInput: <value>` SHALL be treated as
  `prompts.<sole-role>: <value>`. If the agent has more than one
  role after `role`/`roles` normalization, the load SHALL fail
  with an error naming the ambiguous entry.
- An agent with `role: manager` (or `roles: [manager]`) SHALL be
  normalized to `mode: live-shell`.
- An agent with any other role and a legacy shape SHALL be
  normalized to `mode: single-prompt`.
- An agent with `runtime + prompt` and no explicit `mode` SHALL be
  normalized to `mode: single-prompt` unless its sole role is
  `manager`, in which case it SHALL be normalized to
  `mode: live-shell`; the `prompt` value SHALL be placed at
  `prompts.<sole-role>: <prompt>`.

Each normalization that fires SHALL emit a load-time warning
identifying the entry name, the fields that were rewritten, and a
short link to this change's outcome document as the migration guide.

Agents that already conform to the new schema (declare `mode`,
`roles`, and `prompts` directly) SHALL NOT trigger any warnings.

#### Scenario: legacy scalar role normalized
- **GIVEN** an agent `{ name: claude-code, role: code, command: claude, args: […] }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `roles: [code]` and `mode: single-prompt`, and a warning names `claude-code` as a legacy shape

#### Scenario: legacy initialInput folds into prompts
- **GIVEN** an agent `{ name: claude-code, role: code, command: claude, args: [--dangerously-skip-permissions], initialInput: "/opsx:apply ${change_id}" }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `prompts.code: "/opsx:apply ${change_id}"` and `mode: single-prompt`

#### Scenario: legacy manager normalized to live-shell
- **GIVEN** an agent `{ name: claude-manager, role: manager, command: claude, args: [--continue] }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `roles: [manager]`, `mode: live-shell`, and `prompts.manager` populated from the built-in default when `initialInput` is absent

#### Scenario: legacy runtime-backed worker
- **GIVEN** an agent `{ name: claude-worker, role: code, runtime: claude, prompt: "/opsx:apply ${change_id}" }`
- **WHEN** the registry loads
- **THEN** the normalized entry has `roles: [code]`, `mode: single-prompt`, and `prompts.code: "/opsx:apply ${change_id}"`

#### Scenario: legacy initialInput on multi-role after user manual edit rejected
- **GIVEN** an agent hand-edited to `{ roles: [code, review], initialInput: "…" }`
- **WHEN** the registry loads
- **THEN** the load fails with an error stating `initialInput` cannot be used on a multi-role agent; the user is directed to use `prompts` instead

#### Scenario: new-schema entry loads without warnings
- **GIVEN** an agent that declares `mode`, `roles`, and `prompts` directly
- **WHEN** the registry loads
- **THEN** the load succeeds and no legacy-shape warning is emitted for that entry

### Requirement: Role-Based Agent Dispatch API

The server SHALL expose `POST /api/agents/dispatch` — a role-driven,
local-only endpoint that selects a matching agent from `agents.yaml`,
runs it against the given change, and (by default) blocks until the
job completes before returning the resolved outcome. The request
body SHALL accept `{ role, changeId }` as required fields and
`{ runtime?, promptSuffix?, wait?, timeoutMs? }` as optional fields.

The `role` request field SHALL remain a **scalar** string. Selection
SHALL match `request.role` against each candidate agent's `roles`
array (contains-check) — see `Agent Selection By Role And
Specialties`. The response SHALL carry the resolved job id, chosen
agent name and runtime label, terminal status (`completed | failed
| cancelled | timeout`), optional exit code, stdout tail, and a list
of artifact paths generated inside the change directory.

#### Scenario: happy-path dispatch
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo" }` and an agent with `code` in `roles` exists
- **THEN** the server runs the agent, blocks until completion, and returns `{ jobId, agentName, runtime, status: "completed", exitCode: 0, artifactPaths: [] }`

#### Scenario: role has no matching agent
- **WHEN** a client POSTs `{ role: "unknown-role", changeId: "add-foo" }`
- **THEN** the server responds 404 with a message identifying the role and change id

#### Scenario: multi-role agent covers dispatch
- **GIVEN** a single agent with `roles: [code, review, verify]`
- **WHEN** a client POSTs `{ role: "review", changeId: "add-foo" }`
- **THEN** the same agent is selected and its job carries `role: "review"` (the dispatched role, not the whole `roles` array)

#### Scenario: unknown change id
- **WHEN** a client POSTs `{ role: "code", changeId: "does-not-exist" }`
- **THEN** the server responds 404 with a "change not found" message

#### Scenario: empty registry
- **WHEN** `agents.yaml` declares no agents at all
- **THEN** the endpoint responds 503 with a "no agents defined" message (matching the pre-existing `/api/agents/run` behavior)

#### Scenario: non-local origin rejected
- **WHEN** a request arrives from a non-local address
- **THEN** the server responds 403 (same guard as `/api/agents/run`)

#### Scenario: wait=false returns immediately
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo", wait: false }`
- **THEN** the server starts the job and returns immediately with `{ jobId, status: "running" }`; the caller SHALL poll `/api/agents/jobs/:id` for completion

### Requirement: Agent Selection By Role And Specialties

The dispatch selector SHALL filter agents from `agents.yaml` by
matching (a) the request `role` against each candidate's `roles`
array (contains-check), (b) an intersection between the change's
frontmatter tags and the agent's `specialties`, and (c) the
requested `runtime` when supplied. An agent whose `specialties` is
empty or contains `"any"` SHALL be treated as a wildcard match.
When multiple agents satisfy all filters, the selector SHALL return
the first one in `agents.yaml` declaration order.

#### Scenario: roles array contains-check
- **GIVEN** an agent with `roles: [code, review, verify]` and specialties matching the change
- **WHEN** the client dispatches `{ role: "verify", changeId: "add-foo" }`
- **THEN** the agent is selected

#### Scenario: specialty intersection selects the right agent
- **GIVEN** two agents `code-claude` (`roles: [code]`, `specialties: [ts, react]`) and `code-aider` (`roles: [code]`, `specialties: [python]`)
- **AND** change `add-foo`'s proposal frontmatter has `tags: [python]`
- **WHEN** the client dispatches `{ role: "code", changeId: "add-foo" }`
- **THEN** `code-aider` is selected

#### Scenario: wildcard specialties always match
- **GIVEN** an agent with `roles: [code]` and `specialties: [any]`
- **WHEN** a client dispatches for any change
- **THEN** the agent is a valid candidate regardless of the change's tags

#### Scenario: runtime filter narrows candidates
- **GIVEN** two agents both with `code` in `roles` — one `runtime: claude` and one `runtime: aider`, both matching specialties
- **WHEN** a client dispatches `{ role: "code", changeId: "add-foo", runtime: "aider" }`
- **THEN** the aider-backed agent is selected

#### Scenario: deterministic order
- **GIVEN** two agents both match role, specialties, and runtime filters
- **WHEN** the client dispatches
- **THEN** the agent that appears first in `agents.yaml` is selected

### Requirement: Job Model Includes Role And Runtime

Every agent job SHALL carry `role: string` and `runtime: string`
fields set at spawn time. The `role` field on a job SHALL be a
**scalar** — the specific role that was dispatched — even when the
selected agent has multiple roles. The runner SHALL populate
`runtime` from the agent's `runtime` reference when set, from the
literal string `"legacy"` when the agent declares `command` directly
without a runtime, or from `"unknown"` for orphan-adopted jobs. For
jobs synthesized by orphan adoption where no agent definition is
available, the runner SHALL set `role = "orphan"` and
`runtime = "unknown"`. These fields SHALL NOT change during the
job's lifetime.

#### Scenario: multi-role agent job records the dispatched role
- **GIVEN** an agent `claude-worker` with `roles: [code, review, verify]` and `runtime: claude`
- **WHEN** the client dispatches `{ role: "review", changeId: "add-foo" }` and the runner starts the job
- **THEN** the job's `role` is `"review"` and `runtime` is `"claude"`

#### Scenario: runtime-referenced spawn labels the runtime name
- **GIVEN** an agent with `runtime: claude`, `roles: [code]`, `mode: single-prompt`
- **WHEN** the runner starts a job for it
- **THEN** the job's `role` is `"code"` and `runtime` is `"claude"`

#### Scenario: command-only agent gets legacy runtime label
- **GIVEN** an agent with `command: aider`, `args: […]`, `roles: [code]`, `mode: single-prompt`, no `runtime` reference
- **WHEN** the runner starts a job for it
- **THEN** the job's `role` is `"code"` and `runtime` is `"legacy"`

#### Scenario: orphan adoption gets synthetic labels
- **GIVEN** the server adopts an orphan worktree with no matching agent definition
- **WHEN** the job is registered
- **THEN** the job's `role` is `"orphan"` and `runtime` is `"unknown"`
