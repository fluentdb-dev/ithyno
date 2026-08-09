## ADDED Requirements

### Requirement: Runtime-Aware Worker Launch Strategy

The ithyno dispatcher SHALL select a worker launch strategy from the canonical
Manager CLI identity, canonical worker CLI identity, worker mode, agmsg
availability, and native-delegation adapter availability. The strategy priority
MUST be `agmsg`, then same-CLI native delegation, then registry-backed
subprocess. CLI aliases that denote the same client, including `agy` and
`antigravity`, MUST compare as one canonical identity.

#### Scenario: Same CLI uses native delegation
- **GIVEN** the Manager and selected worker resolve to the same canonical CLI
- **AND** the Manager rendering provides a native child Agent/Tool adapter
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it invokes the native child Agent/Tool with the resolved role prompt
- **AND** it does not spawn the worker CLI subprocess

#### Scenario: Agy aliases use invoke_subagent
- **GIVEN** the Manager and worker resolve to canonical CLI `agy`
- **AND** the Agy 1.1.11 Manager runtime exposes `invoke_subagent`
- **AND** the worker is not taking the live-shell/agmsg branch
- **WHEN** the dispatcher starts a stage
- **THEN** it invokes the worker through `invoke_subagent`
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

### Requirement: Registry Owns Cross-CLI Prompt Arguments

Every dispatcher-selected subprocess worker SHALL be launched through
`AgentRegistry.resolve()` and the Agent runner rather than through a shell
command assembled by the dispatch skill. For a resolved single prompt, Codex
MUST use `codex <args> exec <prompt>` with no Claude-style prompt flag, while
every other supported subprocess CLI MUST use `<command> <args> -p <prompt>`.
An already complete user-authored prompt invocation MUST NOT receive a duplicate
subcommand, flag, or prompt.

#### Scenario: Claude Manager launches Codex worker
- **GIVEN** a Claude Manager and a Codex single-prompt worker with no prompt in its args
- **WHEN** the dispatcher launches the worker with resolved prompt `openspec-apply add-x`
- **THEN** the Agent runner argv contains `exec` followed by `openspec-apply add-x`
- **AND** the argv does not use `-p` as a prompt flag

#### Scenario: Codex Manager launches Agy worker
- **GIVEN** a Codex Manager and an Agy single-prompt worker with no prompt in its args
- **WHEN** the dispatcher launches the worker with resolved prompt `/opsx:apply add-x`
- **THEN** the Agent runner appends `-p` followed by `/opsx:apply add-x`
- **AND** `agents.yaml` does not need to declare `-p`

#### Scenario: Existing prompt invocation is preserved
- **GIVEN** a worker whose configured args already contain its complete native prompt invocation
- **WHEN** the registry resolves the worker
- **THEN** the configured invocation remains authoritative
- **AND** no second prompt is appended

### Requirement: Dispatcher Execution Root Reuse Is Server-Constrained

The Agent runner SHALL support dispatcher-initiated execution in the expected
worktree or current main tree without accepting an arbitrary filesystem path
from the request. The server MUST derive the execution root from its current
project, change id, and resolved execution mode; validate an existing worktree
before reuse; and reject a missing, stale, wrong-branch, or foreign-repository
target without overwriting or deleting it.

#### Scenario: Reuse the expected worktree
- **GIVEN** the dispatcher created `.worktrees/add-x` for branch `agent/add-x`
- **WHEN** it requests a registry-backed worker for `add-x` in worktree mode
- **THEN** the Agent runner uses that directory as `cwd`
- **AND** it does not attempt to create a second worktree

#### Scenario: Run in the current project root
- **GIVEN** the resolved execution mode is main-tree execution
- **WHEN** the dispatcher requests a registry-backed worker
- **THEN** the Agent runner uses the server's current project root
- **AND** the request contains no caller-selected path

#### Scenario: Reject an unexpected existing worktree
- **GIVEN** `.worktrees/add-x` exists but does not belong to the expected repository and branch
- **WHEN** the dispatcher requests its reuse
- **THEN** the server rejects the launch with actionable diagnostics
- **AND** it does not remove, reset, overwrite, or execute inside that directory

### Requirement: Claude-Canonical Dispatch Skill Distribution

The repository SHALL keep the Claude-authored ithyno dispatch definition as the
behavioral source of truth and SHALL generate other Agent CLI dispatch material
through the universal-source renderer pipeline. Renderers MAY translate command
syntax and native Agent/Tool instructions, but generated copies MUST preserve
the launch priority and worker contracts defined by this capability.

#### Scenario: Codex rendering uses registry-backed subprocess fallback
- **GIVEN** the canonical dispatch source describes launch strategy selection
- **WHEN** the Codex rendering evaluates a same-CLI Codex worker
- **THEN** it falls back to the server Agent runner subprocess path
- **AND** it does not invent an unsupported native sub-agent tool

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
