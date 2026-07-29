## MODIFIED Requirements

### Requirement: Escalate Command Wrapper

The `/ithy-opsx:escalate <change-id> "<question>"` slash command SHALL exist as a prompt template that instructs a Claude Code session to construct a JSON body containing the question and a context string assembled from the change's current state (phase, recent diff summary, prior review verdict) and to invoke `POST /api/changes/<change-id>/needs-human` via a Bash + curl call to `http://localhost:4321`. On HTTP 2xx the template SHALL report success to the caller; on non-2xx it SHALL surface the error body for further handling.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/ithy-opsx/escalate.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads and follows the curl-based escalation flow

#### Scenario: successful escalation
- **GIVEN** the endpoint returns HTTP 200
- **WHEN** the template's post-flow reporting runs
- **THEN** the caller receives an "escalated" confirmation with the API's returned status snippet

#### Scenario: error surfaced
- **GIVEN** the endpoint returns HTTP 400 (empty question) or 409 (already escalated)
- **WHEN** the template's error-handling runs
- **THEN** the caller receives the endpoint's error message verbatim so it can decide next action

### Requirement: Answer Command Wrapper

The `/ithy-opsx:answer <change-id> "<answer>"` slash command SHALL exist as a prompt template that instructs a Claude Code session to invoke `POST /api/changes/<change-id>/needs-human/answer` via Bash + curl to `http://localhost:4321` with the answer text as the JSON body, and to report the endpoint's response back to the caller. The template SHALL be safe to invoke only when the change is currently in `needs-human` state; the endpoint's 409 return is the safety net.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/ithy-opsx/answer.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads and follows the curl-based answer flow

#### Scenario: successful answer
- **GIVEN** the endpoint returns HTTP 200 (change was in needs-human)
- **WHEN** the template's reporting runs
- **THEN** the caller receives an "answer submitted" confirmation

#### Scenario: 409 when not escalated
- **GIVEN** the endpoint returns HTTP 409 (change is not in needs-human)
- **WHEN** the template's error-handling runs
- **THEN** the caller receives the "change is not in needs-human" error verbatim

### Requirement: Revert Slash Command

The project SHALL provide a `/ithy-opsx:revert <scope>` slash command that a worker or user runs inside Claude Code to open a Case α or Case β revert change under the naming convention `revert-<scope>`. The command SHALL enforce the PENDING annotation and (Case α only) REVERTED annotation conventions documented in `CLAUDE.md` and `.claude/skills/openspec-flow/SKILL.md`.

Concretely, when invoked, the command SHALL:

1. Take an optional `<scope>` argument (kebab-case). If omitted, the command SHALL prompt the user for a scope description and derive the kebab-case id from it (same pattern as `/opsx:propose`).
2. Prompt the user for the target requirement(s) to revert. Multiple targets per capability are allowed; multiple capabilities are allowed.
3. For each target, classify Case α (target's ADDED delta has already reached `openspec/specs/<capability>/spec.md`) or Case β (target still in-flight in `openspec/changes/<target-id>/`).
4. Run `openspec new change revert-<scope>` and populate:
   - `proposal.md` with a `## Why` narrative and a `## Targets` list citing each target by id and its Case α / β classification;
   - `specs/<capability>/spec.md` with `## REMOVED Requirements` or `## MODIFIED Requirements` sections (Case α) or `## ADDED Requirements` describing the post-revert baseline (Case β);
   - `tasks.md` with a checklist of standard revert steps (spec deltas, impl reverts, target annotations, verification).
5. Insert `> ⚠️ **PENDING REMOVAL** by [revert-<scope>](path)` (or `PENDING MODIFICATION`) directly beneath the affected `### Requirement:` heading in the current `openspec/specs/<capability>/spec.md` for every target.
6. For Case α only, insert `> **REVERTED** by [revert-<scope>](path)` (or `PARTIALLY REVERTED` when only a subset of the target's requirements is affected) at the top of every archived target's `proposal.md`, immediately after the closing frontmatter delimiter.
7. Run `npm run openspec -- validate revert-<scope>` and report the result. If invalid, the command SHALL surface the error and stop before any git action.

The command SHALL NOT invoke `git commit`, `openspec archive`, or any destructive action — the resulting change goes through the standard `/ithy-opsx:apply` → `/ithy-opsx:archive` flow like any other.

The command's backing skill SHALL live at `.claude/skills/ithy-opsx-revert/SKILL.md`. The former `/opsx:revert` name and `opsx-revert` skill id SHALL NOT be recognized after this change ships — attempting them yields "Unknown command" from Claude Code.

#### Scenario: `/ithy-opsx:revert kanban-ui-lanes` (Case α, no argument prompt)
- **GIVEN** `openspec/specs/dashboard/spec.md` contains a landed requirement `Kanban Phase Swim Lanes`
- **AND** the user has determined they want to revert it
- **WHEN** the user invokes `/ithy-opsx:revert kanban-ui-lanes` and confirms the target selection
- **THEN** `openspec/changes/revert-kanban-ui-lanes/proposal.md`, `specs/dashboard/spec.md`, and `tasks.md` are created; a PENDING REMOVAL blockquote is inserted directly under `### Requirement: Kanban Phase Swim Lanes` in the current spec; the archived target proposal is annotated with a REVERTED blockquote; and `openspec validate revert-kanban-ui-lanes` reports VALID.

#### Scenario: Case β target — archived-target archive procedure
- **GIVEN** an in-flight change `openspec/changes/add-foo/` that has not yet been archived
- **WHEN** the user invokes `/ithy-opsx:revert foo` and picks the in-flight change as the target
- **THEN** the command SHALL follow the "Reverted-target archive (Case β)" procedure documented in `.claude/skills/openspec-flow/SKILL.md` — the target's `outcome.md` is rewritten to point at the revert, its `specs/` directory is deleted, and the revert's delta uses ADDED headers describing the post-revert baseline

#### Scenario: Command aborts on validation failure
- **GIVEN** the user typed an invalid scope containing a slash
- **WHEN** the command runs `openspec new change`
- **THEN** the CLI's error surfaces to the user
- **AND** no PENDING or REVERTED annotations are inserted anywhere

## ADDED Requirements

### Requirement: Ithyno's slash-command surface is `/ithy-opsx:*` exclusively

All ithyno-authored Claude Code slash-commands SHALL live under the `/ithy-opsx:*` namespace exclusively. Ithyno SHALL NOT add commands to the upstream `/opsx:*` namespace (which is owned by `openspec init` and represents upstream openspec's public API).

The complete set of ithyno-owned commands SHALL be:

- `/ithy-opsx:answer` — submit an answer that closes a needs-human escalation.
- `/ithy-opsx:apply` — apply-with-commit variant of `/opsx:apply`; runs the openspec apply flow, then commits.
- `/ithy-opsx:archive` — archive a change as one commit.
- `/ithy-opsx:dispatch` — run the code / review / verify chain for one change.
- `/ithy-opsx:dispatch-multi` — same as dispatch, for several changes concurrently.
- `/ithy-opsx:escalate` — post an escalation to `needs-human` for a change.
- `/ithy-opsx:import` — spawn a Task-tool sub-agent to generate first-draft specs for a target project.
- `/ithy-opsx:merge` — merge an agent worktree branch into develop.
- `/ithy-opsx:review` — review a change's diff and write `review.md`.
- `/ithy-opsx:revert` — open a Case α or Case β revert change (see Revert Slash Command).
- `/ithy-opsx:verify` — run the Node build chain (test / typecheck / build) and write `review.md`.

Every command SHALL have its file at `.claude/commands/ithy-opsx/<verb>.md` in the ithyno-ui repo. Skills that back these commands SHALL live under `.claude/skills/ithy-opsx-*/`. The ithyno-ui repo's `.claude/commands/opsx/` SHALL be empty of ithyno-authored files (upstream `openspec init` output continues to write to that path per-project as ithyno-external content).

#### Scenario: Ithyno-ui repo does not shadow upstream opsx commands
- **GIVEN** a fresh clone of the ithyno-ui repo
- **WHEN** the reviewer inspects `.claude/commands/opsx/`
- **THEN** every file present there is upstream openspec output, reproducible by running `openspec update` (currently `apply.md`, `archive.md`, `explore.md`, `propose.md`, `sync.md`)
- **AND** none of ithyno's own commands (`answer.md`, `escalate.md`, `revert.md`) appear there
- **AND** all ithyno-authored slash-command files live under `.claude/commands/ithy-opsx/`

> Note: the point is that ithyno keeps no hand-maintained *copies* of
> upstream commands, not that `/opsx:*` is absent from this repo. The
> repo is itself an OpenSpec project and needs those commands — the
> `code` role's prompt is `/opsx:apply <change-id>`. They must come from
> `openspec update`, so they track upstream instead of drifting.

#### Scenario: Namespace is closed
- **GIVEN** any Manager PTY started by ithyno on any project
- **WHEN** the user types `/opsx:answer`, `/opsx:escalate`, or `/opsx:revert`
- **THEN** Claude Code reports "Unknown command"
- **AND** the equivalent under `/ithy-opsx:` resolves normally

