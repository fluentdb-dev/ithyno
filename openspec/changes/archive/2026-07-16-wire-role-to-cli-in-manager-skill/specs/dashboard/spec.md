# Delta: dashboard — delegate execution decisions to skill layer

Phase 1 (impl now) covers the UI walk-back. Phase 2 (spec-only, impl
deferred to a follow-up change) captures the future skill contract for
worktree spawn + role→CLI dispatch.

## REMOVED Requirements

### Requirement: Start Flow Consumes Config Instead Of Picker

**Reason**: The picker was removed by `add-parallel-execution-config`
(the immediate predecessor). This propose additionally removes the
UI's consumption of `parallelExecution` — the config still exists in
`agents.yaml`, but the skill layer is the sole consumer. Replaced by
`Start Flow Delegates Execution To Skill Layer` below.

## ADDED Requirements

### Requirement: Start Flow Delegates Execution To Skill Layer

The Kanban Start button and the ChangeDetail Start button SHALL
inject `/opsx:apply <change-id>` into the embedded terminal without
opening any picker, agent-selection modal, or worktree spawn from
the UI. The UI SHALL NOT read `parallelExecution`, SHALL NOT filter
`agents.yaml` by role, and SHALL NOT check worktree prerequisites
(`gitStatus.isRepo`, `hasCommits`, uncommitted proposal, etc.) — the
skill layer takes full responsibility for those decisions when it
evaluates `/opsx:apply`.

Only one prerequisite failure SHALL surface as a toast notification
from the UI: embedded terminal unavailable → "No embedded terminal —
open a change view to spawn one".

The UI SHALL NOT gate on `agents.yaml` contents. When `agents.yaml`
is empty or lacks a code-role entry, the skill falls back to Manager;
Manager itself uses built-in defaults when no manager entry is
declared. All that decision-making lives in the skill layer.

All other execution concerns (which CLI to spawn, whether to create a
worktree, what branch to commit on) are downstream of the skill and
NOT the UI's responsibility.

#### Scenario: Start injects skill invocation
- **GIVEN** the embedded terminal is available
- **WHEN** the user clicks Start on a change
- **THEN** the flow opens the Apply CommandModal proposing `/opsx:apply <change-id>`, injects it into the terminal on submit, and shows no picker or worktree modal

#### Scenario: no worktree spawn from UI regardless of config
- **GIVEN** `parallelExecution: true` in `agents.yaml`
- **WHEN** the user clicks Start
- **THEN** the UI still only injects `/opsx:apply <id>` into the terminal — no `POST /api/agents/run` is issued from the Start flow

#### Scenario: no embedded terminal surfaces as toast
- **GIVEN** the embedded terminal is unavailable
- **WHEN** the user clicks Start
- **THEN** a toast reports "No embedded terminal — open a change view to spawn one" and no injection occurs

#### Scenario: empty agents.yaml does not gate Start
- **GIVEN** `agents.yaml` empty (`agents: []`) or missing a code-role entry
- **WHEN** the user clicks Start
- **THEN** the UI still injects `/opsx:apply <id>` — the skill layer resolves the fallback to Manager (which has built-in defaults). The UI shows no "No agents" toast and does not hide the Start button.

#### Scenario: per-change proposal.execution override ignored
- **GIVEN** a change with `proposal.execution: worktree` in its frontmatter
- **WHEN** the user clicks Start
- **THEN** the UI still only injects `/opsx:apply <id>` — the override is now a signal for the skill layer to read, not for the UI to consume

### Requirement: Repo-Level Agent Instructions Files

The repository SHALL contain two instructions files at the repository
root so non-Claude CLIs invoked as workers receive the same project
contract that Claude Code receives via `CLAUDE.md`:

- `.github/copilot-instructions.md` — automatically loaded by Copilot
  CLI when it starts in the repo.
- `AGENTS.md` — read by Antigravity (`agy`) and any future
  CLI-agnostic agent runner that scans repo-root instruction files.

Each file SHALL document the code / review / verify worker contracts:

- Location of change files (`openspec/changes/<change-id>/`).
- **Code role**: implement outstanding tasks in the current worktree,
  commit on the agent branch, do NOT touch files outside the change's
  scope, do NOT modify `main` directly.
- **Review role**: write `openspec/changes/<change-id>/review.md` with
  frontmatter `verdict: pass | needs-rework` and `findings: [...]`.
  Do NOT emit the verdict on stdout; the file is the sole contract.
- **Verify role**: same output contract as review (updates
  `review.md`).

`CLAUDE.md` already covers Claude behavior and SHALL NOT be duplicated
into these files — the two new files exist to bridge the vendor gap
Claude does not have.

> **Phase 2 requirement** — captured here as future contract; impl
> lands in a follow-up change together with the Manager loop and
> `/opsx:apply` skill rewrites.

#### Scenario: copilot-instructions file present
- **GIVEN** the file `.github/copilot-instructions.md`
- **WHEN** Copilot CLI starts in the repo root
- **THEN** it reads the file and adopts the code / review / verify worker contract described therein

#### Scenario: AGENTS.md present
- **GIVEN** the file `AGENTS.md` at the repository root
- **WHEN** Antigravity or another CLI-agnostic agent runner reads it
- **THEN** the same contract is available under the agent-runner-neutral filename

#### Scenario: review.md is the sole contract
- **GIVEN** a non-Claude CLI invoked for the review role
- **WHEN** the CLI completes with any stdout output
- **THEN** the Manager ignores stdout and reads only `openspec/changes/<change-id>/review.md`, escalating when the file is absent or unparseable

## MODIFIED Requirements

### Requirement: IN-PROGRESS Column Start Launcher

The Kanban IN-PROGRESS column SHALL expose a header-level Start launcher
button — visually and semantically parallel to the TODO column's
`+ New Change` button — that opens a popover listing every change ready to
run and dispatches the shared start flow when one is picked, so users can
kick off parallel implementations without leaving the column they are
watching progress in.

#### Scenario: Launcher renders with count
- **WHEN** the IN-PROGRESS column mounts and there is at least one startable candidate
- **THEN** the header shows `Start ▾` with a candidate-count badge and the button is enabled

#### Scenario: Launcher renders disabled when there are no candidates
- **WHEN** every change is already running, completed, or has only verify-only work left
- **THEN** the launcher button is disabled with the reason `"Nothing startable — all changes are already running or have verify-only work left."`

#### Scenario: Launcher does NOT gate on empty agents.yaml
- **WHEN** `agents.yaml` is empty (`agents: []`) or lacks a code-role entry
- **THEN** the launcher renders enabled if there are startable candidates — the skill falls back to Manager when the user picks one

#### Scenario: Popover lists startable candidates
- **WHEN** the user clicks the launcher and candidates exist
- **THEN** a popover anchored to the button lists each startable change with its id, tags summary, and current progress (`done/total`)

#### Scenario: Startable filter uses shared predicates
- **WHEN** the launcher computes its candidate list
- **THEN** it uses the same `hasNonVerifyWork` and `isRunningOrPending` predicates that the card-level Start button uses; the two agree on what counts as startable

#### Scenario: Pick dispatches through shared start flow
- **WHEN** the user picks a candidate
- **THEN** the launcher calls `useStartFlow().startImplementation(change)` which injects `/opsx:apply <id>` into the embedded terminal via CommandModal — no picker, no agent-selection modal, no worktree spawn from the UI

#### Scenario: Card visibly moves to IN-PROGRESS on skill spawn
- **WHEN** the injected `/opsx:apply` skill causes an agent job to appear (via any means the skill uses internally, e.g. `POST /api/agents/run`)
- **THEN** the card renders in the IN-PROGRESS column via the existing `bucketize` job-aware behavior

#### Scenario: Popover dismissal
- **WHEN** the user clicks outside the popover or presses Escape
- **THEN** the popover closes and no start is triggered

### Requirement: Manager Loop Slash Command

The `/opsx:manage <change-id>` slash command SHALL exist as a prompt
template that instructs a Claude Code session to run the Manager
orchestration loop for the change: read change context, iterate over
`code → review` worker invocations until the review verdict is
`"pass"`, then invoke `verify` once, and update the change's phase via
`POST /api/changes/:id/phase` on each successful transition
(`coded → reviewed → done`). The template SHALL bound iterations at a
hard-coded MAX_ITERATIONS constant (default 5) and SHALL escalate the
change to `needs-human` when the loop fails to converge, when any
worker returns a subprocess failure, when a review or verify produces
no `review.md`, or when `review.md` lacks a structured verdict.

For each worker stage, the Manager SHALL:

1. Look up the agent entry in `agents.yaml` whose `roles` includes the
   stage role (`code`, `review`, or `verify`).
2. Resolve the prompt template from `entry.prompts[stage.role]`,
   falling back to a built-in default when absent.
3. Dispatch based on `entry.command`:
   - `command == "claude"` → invoke via the Claude Code **Task tool**
     (subagent runs the prompt inside the current session).
   - otherwise → run as a **subprocess**: `cd .worktrees/<change-id>
     && <command> <args...> -p "<prompt>"`. The `-p` (or equivalent)
     flag is required so the CLI runs non-interactively. The `args`
     from `agents.yaml` SHALL include any permission-skip flag
     appropriate for the target CLI (`--yolo` for Copilot,
     `--dangerously-skip-permissions` for Antigravity, etc.).

The Manager SHALL judge review and verify stages by a **three-stage
success contract** and NOT by subprocess exit code alone (both Copilot
and Antigravity return exit code 0 on semantic failure):

1. Subprocess exits non-zero → subprocess failure → escalate.
2. Subprocess exits zero but `openspec/changes/<change-id>/review.md`
   is absent or its frontmatter is unparseable → contract failure →
   escalate.
3. `review.md` present with a parseable `verdict:` field → route on
   `pass` (advance phase) / `needs-rework` (loop back with findings
   serialized into the next code stage's prompt).

> **Phase 2 requirement** — spec text captured now (also fixes the
> post-R1 spec-vs-reality gap); skill file rewrite lands in a
> follow-up change.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/manage.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives the change id as its argument, and follows the manager-loop instructions

#### Scenario: convergence loop with pass verdict
- **GIVEN** a change whose `code → review` cycle produces `verdict: pass` on iteration 1
- **WHEN** the Manager follows the template
- **THEN** it sets phase to `coded`, then `reviewed` after review pass, invokes verify, then sets phase to `done` on verify pass — all within one iteration

#### Scenario: needs-rework retries with findings
- **GIVEN** a review that returns `verdict: needs-rework` with 2 findings
- **WHEN** the Manager follows the template
- **THEN** it re-invokes the code worker with the findings serialized into the prompt, then re-invokes the review worker — the loop continues until `pass` or MAX_ITERATIONS is reached

#### Scenario: convergence loop cap
- **GIVEN** a review that keeps returning `verdict: needs-rework` on every iteration
- **WHEN** the Manager reaches MAX_ITERATIONS (default 5) without a pass verdict
- **THEN** the Manager invokes `/opsx:escalate <change-id> "Manager loop did not converge after 5 iterations"` and exits

#### Scenario: claude-role dispatch uses Task tool
- **GIVEN** an `agents.yaml` entry with `command: claude` for the code role
- **WHEN** the Manager reaches the code stage
- **THEN** it invokes the worker via the Task tool with the resolved prompt, not via subprocess

#### Scenario: non-claude role dispatch uses subprocess
- **GIVEN** an `agents.yaml` entry with `command: copilot, args: [--yolo, -s]` for the review role
- **WHEN** the Manager reaches the review stage
- **THEN** it runs `cd .worktrees/<change-id> && copilot --yolo -s -p "<prompt>"` as a subprocess

#### Scenario: subprocess non-zero exit escalates
- **GIVEN** a review subprocess that exits with code 127 (command not found)
- **WHEN** the Manager evaluates the result
- **THEN** it escalates via `/opsx:escalate <change-id> "review subprocess failed with exit code 127"` and exits without further stages

#### Scenario: missing review.md escalates
- **GIVEN** a review subprocess that exits 0 but never writes `openspec/changes/<change-id>/review.md`
- **WHEN** the Manager reads the workspace
- **THEN** it escalates with reason "review returned no artifact" and exits

#### Scenario: unparseable verdict escalates
- **GIVEN** a `review.md` whose frontmatter is missing the `verdict:` field
- **WHEN** the Manager parses the artifact
- **THEN** it escalates with reason "review returned no verdict" and exits

#### Scenario: already-done change exits early
- **GIVEN** a change whose current phase is already `done`
- **WHEN** the Manager reads the current phase
- **THEN** it exits without any dispatch, reporting "change already at phase: done"

#### Scenario: needs-human change is not restarted
- **GIVEN** a change whose current phase is `needs-human`
- **WHEN** the Manager reads the current phase
- **THEN** it exits without any dispatch, reporting "change is in needs-human — answer required before Manager can proceed"

### Requirement: Review Worker Slash Command

The `/opsx:review <change-id>` slash command SHALL exist as a prompt
template that instructs a Claude Code session to inspect the change's
proposal, tasks, spec deltas, and worktree diff, then write
`openspec/changes/<change-id>/review.md` conforming to the schema
defined by `add-review-artifact` (verdict enum, findings array,
optional summary). The template SHALL define the
`verdict: pass | needs-rework` rubric so the Manager can route on the
resulting frontmatter regardless of which CLI executed the worker.

> **Phase 2 requirement** — spec text captured now (also fixes the
> post-R1 spec-vs-reality gap); skill file rewrite lands in a
> follow-up change.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/review.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives `<change-id>` as the argument, and follows the instructions to write `review.md`

#### Scenario: verdict rubric documented
- **GIVEN** the template body
- **WHEN** the reviewer reads it
- **THEN** it lists the pass criteria (proposal-aligned, no blockers) and the needs-rework criteria (spec violation, bug, security concern)
