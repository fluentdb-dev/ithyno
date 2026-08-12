## ADDED Requirements

### Requirement: Project-local Codex command aliases

When Codex is the selected Manager, initialization SHALL materialize the
OpenSpec command surface under the project-local `CODEX_HOME/prompts` directory
using the filename pattern `openspec-<command>.md`, and SHALL materialize
ithyno skill prompts using `ithy-opsx-<command>.md`. The command surface SHALL
support the operator-facing form `openspec-propose <arguments>` and preserve
the command's arguments unchanged.

Initialization SHALL NOT create, rename, or remove prompts in the user's
global Codex home. The initialization-only `CODEX_HOME` override SHALL NOT be
passed to the Codex Manager or workers, so their existing authentication and
configuration remain available. Codex SHALL remain marked unverified until
the executable compatibility harness proves the user-facing invocation.

Initialization SHALL also mirror every project-local
`.claude/skills/ithy-opsx-*/SKILL.md` into the corresponding
`.codex/skills/ithy-opsx-*/SKILL.md`. A Claude command that has no matching
Claude skill SHALL be materialized only as a Codex prompt; initialization
SHALL NOT promote command definitions into Codex skills.

#### Scenario: Codex New Project command surface
- **GIVEN** a user selects Codex as the New Project Manager
- **WHEN** initialization completes
- **THEN** the project contains the Codex prompt for `openspec-propose`
- **AND** the Codex Manager keeps its normal authenticated runtime home
- **AND** no global Codex prompt file is changed by ithyno

#### Scenario: propose arguments are preserved
- **GIVEN** the Codex prompt `openspec-propose` is available
- **WHEN** the user invokes `openspec-propose "test function helloworld"`
- **THEN** the OpenSpec propose workflow receives `test function helloworld`
  as its description

### Requirement: Manager-aware ithyno command injection

The Start flow SHALL inject `ithy-opsx-dispatch <change-id>` when the active
Manager command is Codex. For every other Manager command it SHALL retain the
existing `/ithy-opsx:dispatch <change-id>` injection.

#### Scenario: Codex Manager Start
- **GIVEN** the active Manager is `codex`
- **WHEN** the user starts change `add-hello`
- **THEN** the terminal receives `ithy-opsx-dispatch add-hello`

#### Scenario: Claude Manager Start remains unchanged
- **GIVEN** the active Manager is `claude`
- **WHEN** the user starts change `add-hello`
- **THEN** the terminal receives `/ithy-opsx:dispatch add-hello`

### Requirement: Target-agent-aware worker command delivery

The dispatcher SHALL resolve a role's command using the receiving Agent's CLI.
For a Codex target Agent, the mappings SHALL be `code` →
`openspec-apply-change <change-id>` plus an implementation-only scope contract, `review` → `ithy-opsx-review <change-id>`, and
`verify` → `ithy-opsx-verify <change-id>`. For a non-Codex target Agent, the
dispatcher SHALL preserve the established slash-command prompts.

The dispatcher SHALL use the same resolved command for direct subprocess
delivery and agmsg boot prompts. If the required Codex-native skill is not
installed, it SHALL not fall back to a Claude-only slash command; it SHALL
return an actionable missing-skill error naming the role and command.

#### Scenario: Codex code worker
- **GIVEN** a dispatch stage selects an Agent with `command: codex` for `code`
- **WHEN** it starts work on `add-hello`
- **THEN** the worker receives `openspec-apply-change add-hello` with explicit prohibitions on archive, spec sync, and commit

#### Scenario: Codex review skill is unavailable
- **GIVEN** a dispatch stage selects Codex for `review`
- **AND** `ithy-opsx-review` has not been materialized in the project prompt home
- **WHEN** the dispatcher resolves the worker command
- **THEN** it returns an actionable missing-skill error
- **AND** it does not send `/ithy-opsx:review` to Codex
