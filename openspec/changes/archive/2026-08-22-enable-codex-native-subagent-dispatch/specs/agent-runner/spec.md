## MODIFIED Requirements

### Requirement: Runtime-Aware Worker Launch Strategy

The ithyno dispatcher SHALL select a worker launch strategy from the canonical
Manager CLI identity, canonical worker CLI identity, worker mode, agmsg
availability, native-delegation adapter availability, and whether the selected
worker configuration can be represented by that adapter. The strategy priority
MUST be `agmsg`, then compatible same-CLI native delegation, then
registry-backed subprocess. CLI aliases that denote the same client, including
`agy` and `antigravity`, MUST compare as one canonical identity.

#### Scenario: Same CLI uses native delegation
- **GIVEN** the Manager and selected worker resolve to the same canonical CLI
- **AND** the Manager rendering provides a native child Agent/Tool adapter
- **AND** the worker configuration can be represented by that adapter
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it invokes the native child Agent/Tool with the resolved role prompt
- **AND** it does not spawn the worker CLI subprocess

#### Scenario: Agy aliases use invoke_subagent
- **GIVEN** the Manager and worker resolve to canonical CLI `agy`
- **AND** the Agy Manager runtime exposes `invoke_subagent`
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it invokes the worker through `invoke_subagent`
- **AND** it does not call AgentRunner for that same-CLI launch

#### Scenario: Codex uses native collaboration tools
- **GIVEN** the Manager and worker resolve to canonical CLI `codex`
- **AND** the Codex Manager runtime exposes `spawn_agent` and `wait_agent`
- **AND** the selected worker configuration requires no option unsupported by those tools
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it invokes the worker through `spawn_agent`
- **AND** it waits for that worker through `wait_agent` before stage judgment
- **AND** it does not call AgentRunner for that same-CLI launch

#### Scenario: Cross-CLI worker uses subprocess
- **GIVEN** the Manager and selected worker resolve to different canonical CLIs
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it delegates the launch to the server Agent runner
- **AND** the server resolves and spawns the selected worker CLI

#### Scenario: Same CLI without native adapter falls back
- **GIVEN** the Manager and worker resolve to the same canonical CLI
- **BUT** the Manager rendering has no available native child adapter
- **WHEN** the dispatcher starts a stage
- **THEN** it uses the registry-backed subprocess path
- **AND** it does not invent or assume an unsupported native tool

#### Scenario: Native adapter preserves configured model intent
- **GIVEN** a Codex Manager selects a Codex worker with an explicit model override
- **WHEN** the dispatcher starts the worker
- **THEN** it translates `-m` or `--model` into the native child model field
- **AND** it uses the Codex native delegation path
- **AND** the child runs with the configured model

#### Scenario: Native adapter cannot preserve worker environment
- **GIVEN** a Codex Manager selects a Codex worker with a worker-specific environment
- **WHEN** the dispatcher starts the worker
- **THEN** it uses the registry-backed subprocess path
- **AND** it preserves the configured environment

#### Scenario: Agmsg retains priority
- **GIVEN** a worker eligible for the configured live-shell/agmsg branch
- **WHEN** the Manager and worker also have the same canonical CLI
- **THEN** the dispatcher uses agmsg according to the existing message-based completion contract
- **AND** it does not select native delegation or a direct subprocess

### Requirement: Native Delegation Preserves Worker Contracts

A same-CLI native child Agent/Tool invocation SHALL receive the same resolved
role prompt, absolute target root, review/verify artifact contract, and prior
review findings that an equivalent subprocess worker would receive. Native
delegation MUST await the child result before stage judgment and MUST NOT change
the existing code, review, verify, phase, retry, or commit ownership contracts.

#### Scenario: Native reviewer writes to the dispatcher target
- **GIVEN** a same-CLI review worker launched through a native Agent/Tool
- **WHEN** the child completes its review
- **THEN** its prompt names the exact absolute `review.md` target
- **AND** the Manager judges only the artifact at that target

#### Scenario: Native child receives rework findings
- **GIVEN** review returned `needs-rework` with actionable findings
- **WHEN** the dispatcher launches the next native code child
- **THEN** the child prompt includes those findings under the existing rework contract

#### Scenario: Agy native child is restricted to the target root
- **GIVEN** an Agy Manager launches a same-CLI child with `invoke_subagent`
- **WHEN** the dispatcher resolves worktree or main-tree execution
- **THEN** the child receives the exact absolute target root
- **AND** the child is instructed not to modify files outside that root

#### Scenario: Codex native child is restricted to the target root
- **GIVEN** a Codex Manager launches a same-CLI child with `spawn_agent`
- **WHEN** the dispatcher resolves worktree or main-tree execution
- **THEN** the child receives the exact absolute target root
- **AND** the child is instructed not to modify files outside that root
- **AND** the Manager waits for the child before inspecting stage artifacts

### Requirement: Claude-Canonical Dispatch Skill Distribution

The repository SHALL keep the Claude-authored ithyno dispatch definition as the
behavioral source of truth and SHALL generate other Agent CLI dispatch material
through the universal-source renderer pipeline. Renderers MAY translate command
syntax and native Agent/Tool instructions, but generated copies MUST preserve
the launch priority and worker contracts defined by this capability.

#### Scenario: Codex rendering uses native collaboration
- **GIVEN** the canonical dispatch source describes launch strategy selection
- **WHEN** the Codex rendering evaluates a compatible same-CLI Codex worker
- **THEN** it directs the Manager to use `spawn_agent` and `wait_agent`
- **AND** it preserves the AgentRunner fallback for process-only worker configuration or unavailable native tools

#### Scenario: Codex catalog resolves single-change dispatch exactly
- **GIVEN** ithyno dispatch is installed for Codex
- **WHEN** the user invokes `ithy-opsx-dispatch <change-id>` or asks to dispatch one change
- **THEN** `.codex/skills/ithy-opsx-dispatch/SKILL.md` provides an exact Skill-catalog match
- **AND** the Skill reads `.codex/prompts/ithy-opsx-dispatch.md` as the canonical workflow body
- **AND** it does not substitute `ithy-opsx-dispatch-multi` unless multiple change IDs are explicitly requested

#### Scenario: Agy rendering preserves native and fallback paths
- **GIVEN** the canonical dispatch source describes Agy native delegation
- **WHEN** the Agy rendering evaluates an Agy same-CLI worker
- **THEN** it uses `invoke_subagent`
- **AND** an Agy worker selected by a different Manager CLI still uses the server Agent runner

#### Scenario: Agy dispatch installs a mandatory delegation rule
- **GIVEN** ithyno dispatch skills are installed for Agy/Antigravity
- **WHEN** the renderer materializes the dispatch workflow
- **THEN** it also writes `.agent/rules/ithy-opsx-dispatch.md`
- **AND** the rule requires `invoke_subagent` for a selected same-CLI Agy worker
- **AND** it forbids the Manager from implementing the selected worker role itself
- **AND** it preserves the live-shell/agmsg priority and documented AgentRunner fallback

#### Scenario: Agy project-local output uses the singular directory
- **GIVEN** ithyno skills are installed for Agy/Antigravity
- **WHEN** workflows, dispatch rules, smoke probes, and installation status are materialized or inspected
- **THEN** their project-local paths use `.agent/`
- **AND** new output is not written under `.agents/`
- **AND** legacy `.agents/workflows/` output from older ithyno builds is migrated into `.agent/workflows/`
- **AND** the unrelated global agmsg path `~/.agents/skills/agmsg` remains unchanged

#### Scenario: Agy workflows use flat discoverable names
- **GIVEN** ithyno skills are rendered for Agy/Antigravity
- **WHEN** the renderer emits the dispatch workflow and its related commands
- **THEN** it writes flat files such as `.agent/workflows/ithy-opsx-dispatch.md`
- **AND** it does not rely on a nested `.agent/workflows/ithy-opsx/` directory
- **AND** executable command references use `/opsx-apply` and `/ithy-opsx-review` rather than Claude colon syntax
- **AND** converted Claude commands omit the Claude `name:` field so Agy does not expose labels such as `/ITHY-OPSX: Review`

#### Scenario: Generated output does not restore direct shell assembly
- **GIVEN** any supported CLI rendering of the dispatch skill
- **WHEN** its cross-CLI subprocess instructions are inspected
- **THEN** they route through the server Agent runner
- **AND** they do not contain the generic recipe `<entry.command> <entry.args...> -p <resolved-prompt>`
