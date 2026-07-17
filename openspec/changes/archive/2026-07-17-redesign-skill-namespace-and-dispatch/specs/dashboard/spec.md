# Delta: dashboard — skill namespace + dispatch rename

## RENAMED Requirements

- FROM: `### Requirement: Manager Loop Slash Command`
- TO: `### Requirement: Dispatch Slash Command`

## MODIFIED Requirements

### Requirement: Dispatch Slash Command

The `/ithy-opsx:dispatch <change-id>` slash command SHALL exist as a
prompt template at `.claude/commands/ithy-opsx/dispatch.md`. It is
evaluated by the persistent Manager (a `claude` live-shell session
declared in `agents.yaml` with `roles: [manager]`) when the Kanban
Start button injects the string into the terminal PTY.

The skill SHALL:

1. Read `agents.yaml` top-level `parallelExecution: boolean` (default
   `false`) and the change's `proposal.md` frontmatter `execution:`
   override (`worktree` / `terminal`). Priority: per-change override
   > `parallelExecution` config > default `false`.
2. When the resolved mode is worktree: ensure `.worktrees/<change-id>/`
   exists (`git worktree add -b agent/<change-id>
   .worktrees/<change-id> HEAD`, guarded by `if [ ! -d ]` for
   idempotence). All subsequent worker invocations run with that
   worktree as `cwd`.
3. Advance the change through `proposed → coded → reviewed → done`
   by dispatching workers in stages:
   - **code**: dispatch a worker with prompt `/opsx:apply <change-id>`
     (append `Prior review findings: ...` when returning to this
     stage after a needs-rework verdict). Success = subprocess exit
     0 / Task-tool subagent returned; failure = non-zero exit or
     tool-reported failure → escalate.
   - **review**: dispatch with prompt `/ithy-opsx:review <change-id>`.
     Apply the 3-stage success contract.
   - **verify**: dispatch with prompt `/ithy-opsx:verify <change-id>`.
     Apply the 3-stage success contract.
4. Dispatch each stage via the **Dispatch helper protocol**:
   - Look up the agent entry in `agents.yaml` whose `roles` array
     includes the stage role.
   - If no entry exists for the `code` role, fall back to Manager
     self-dispatch (Task tool with the same prompt). For `review` /
     `verify`, escalate with `no agent declared for role: <S>`.
   - Resolve the prompt from `entry.prompts[S]` if set, else the
     built-in default (`/opsx:apply <id>`, `/ithy-opsx:review <id>`,
     `/ithy-opsx:verify <id>`).
   - Dispatch based on `entry.command`:
     - `command == "claude"` → Task tool invocation.
     - Otherwise → subprocess `cd .worktrees/<id> && <cmd>
       <args...> -p "<prompt>"`. `entry.args` MUST include the CLI's
       permission-skip flag.
5. Apply the **3-stage success contract** for `review` and `verify`
   stages:
   1. Subprocess non-zero exit / Task-tool subagent failure →
      subprocess failure → escalate.
   2. Subprocess exit 0 but `openspec/changes/<change-id>/review.md`
      absent or its frontmatter unparseable → contract failure →
      escalate.
   3. `review.md` present with `verdict:` frontmatter → route on
      `pass` (advance phase) / `needs-rework` (loop back to code with
      findings serialized into the next prompt).

The code stage SHALL NOT use the 3-stage contract (no artifact
contract for code — the impl lands in the worktree directly).
Success = subprocess/task success. After a successful code stage
the dispatcher commits on `agent/<change-id>` (workers no longer
commit themselves) and advances phase to `coded`.

MAX_ITERATIONS is a hard-coded ceiling (default 5) for the
code↔review loop. On non-convergence the dispatcher escalates via
`/opsx:escalate <change-id> "<reason>"` and exits.

The dispatcher SHALL NOT bypass the exit code alone for review/verify
— both Copilot and Antigravity return exit code 0 even on semantic
failure; only `review.md` is the contract.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/ithy-opsx/dispatch.md`
- **WHEN** a Claude Code live-shell session evaluates the slash command
- **THEN** the template loads, receives the change id as its argument, and follows the dispatcher instructions

#### Scenario: convergence loop with pass verdict
- **GIVEN** a change whose `code → review` cycle produces `verdict: pass` on iteration 1
- **WHEN** the dispatcher follows the template
- **THEN** it sets phase to `coded`, then `reviewed` after review pass, invokes verify, then sets phase to `done` on verify pass — all within one iteration

#### Scenario: needs-rework retries with findings
- **GIVEN** a review that returns `verdict: needs-rework` with 2 findings
- **WHEN** the dispatcher follows the template
- **THEN** it re-invokes the code worker with the findings serialized into the prompt (`/opsx:apply <id>` followed by `Prior review findings: ...`) — the loop continues until `pass` or MAX_ITERATIONS is reached

#### Scenario: convergence loop cap
- **GIVEN** a review that keeps returning `verdict: needs-rework` on every iteration
- **WHEN** the dispatcher reaches MAX_ITERATIONS (default 5) without a pass verdict
- **THEN** the dispatcher invokes `/opsx:escalate <change-id> "Dispatch loop did not converge after 5 iterations"` and exits

#### Scenario: claude-role dispatch uses Task tool
- **GIVEN** an `agents.yaml` entry with `command: claude` for the code role
- **WHEN** the dispatcher reaches the code stage
- **THEN** it invokes the worker via the Task tool with the resolved `/opsx:apply <id>` prompt, not via subprocess

#### Scenario: non-claude role dispatch uses subprocess
- **GIVEN** an `agents.yaml` entry with `command: copilot, args: [--yolo, -s]` for the review role
- **WHEN** the dispatcher reaches the review stage
- **THEN** it runs `cd .worktrees/<change-id> && copilot --yolo -s -p "/ithy-opsx:review <id>"` as a subprocess

#### Scenario: subprocess non-zero exit escalates
- **GIVEN** a review subprocess that exits with code 127 (command not found)
- **WHEN** the dispatcher evaluates the result
- **THEN** it escalates via `/opsx:escalate <change-id> "review subprocess failed with exit code 127"` and exits without further stages

#### Scenario: missing review.md escalates
- **GIVEN** a review subprocess that exits 0 but never writes `openspec/changes/<change-id>/review.md`
- **WHEN** the dispatcher reads the workspace
- **THEN** it escalates with reason "review returned no artifact" and exits

#### Scenario: unparseable verdict escalates
- **GIVEN** a `review.md` whose frontmatter is missing the `verdict:` field
- **WHEN** the dispatcher parses the artifact
- **THEN** it escalates with reason "review returned no verdict" and exits

#### Scenario: worktree bootstrap idempotent on re-run
- **GIVEN** `.worktrees/<id>/` already exists (previous run left it)
- **WHEN** the dispatcher runs step 2 again
- **THEN** it skips `git worktree add` (guarded by `if [ ! -d ]`) and reuses the existing worktree

#### Scenario: parallelExecution false uses main tree
- **GIVEN** `agents.yaml` with `parallelExecution: false` and no override
- **WHEN** the dispatcher resolves the execution mode
- **THEN** it does NOT create a worktree; workers run in the main tree via subprocess `cd` to project root (or Task tool without cd)

#### Scenario: proposal.execution override wins
- **GIVEN** `agents.yaml` `parallelExecution: false` but change's `proposal.execution: worktree`
- **WHEN** the dispatcher resolves mode
- **THEN** the per-change override wins — worktree is created and used

#### Scenario: no code agent falls back to Manager
- **GIVEN** `agents.yaml` has no entry with `roles: code`
- **WHEN** the dispatcher reaches the code stage
- **THEN** it invokes the Task tool with the resolved prompt (Manager self-dispatch), rather than escalating

#### Scenario: already-done change exits early
- **GIVEN** a change whose current phase is already `done`
- **WHEN** the dispatcher reads the current phase
- **THEN** it exits without any dispatch, reporting "change already at phase: done"

#### Scenario: needs-human change is not restarted
- **GIVEN** a change whose current phase is `needs-human`
- **WHEN** the dispatcher reads the current phase
- **THEN** it exits without any dispatch, reporting "change is in needs-human — answer required before dispatcher can proceed"

### Requirement: Review Worker Slash Command

The `/ithy-opsx:review <change-id>` slash command SHALL exist as a
prompt template at `.claude/commands/ithy-opsx/review.md` that
instructs a Claude Code session (or any CLI invoked as a review
worker) to inspect the change's proposal, tasks, spec deltas, and
worktree diff, then write `openspec/changes/<change-id>/review.md`
conforming to the schema defined by `add-review-artifact` (verdict
enum, findings array, optional summary). The template SHALL define
the `verdict: pass | needs-rework` rubric so the dispatcher can
route on the resulting frontmatter regardless of which CLI executed
the worker.

The template SHALL state explicitly that `review.md` is the **sole
contract**: the dispatcher never reads stdout, only parses the
artifact. Workers that emit the verdict on stdout without writing
`review.md` are treated as contract failures and escalate.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/ithy-opsx/review.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives `<change-id>` as the argument, and follows the instructions to write `review.md`

#### Scenario: verdict rubric documented
- **GIVEN** the template body
- **WHEN** the reviewer reads it
- **THEN** it lists the pass criteria (proposal-aligned, no blockers) and the needs-rework criteria (spec violation, bug, security concern)

#### Scenario: sole-contract clause present
- **GIVEN** the template body
- **WHEN** the reviewer reads the Guardrails section
- **THEN** it states that `review.md` is the sole contract and stdout is ignored by the dispatcher

### Requirement: Start Flow Delegates Execution To Skill Layer

The Kanban Start button and the ChangeDetail Start button SHALL
inject `/ithy-opsx:dispatch <change-id>` into the embedded terminal
without opening any picker, agent-selection modal, or worktree spawn
from the UI. The UI SHALL NOT read `parallelExecution`, SHALL NOT
filter `agents.yaml` by role, and SHALL NOT check worktree
prerequisites (`gitStatus.isRepo`, `hasCommits`, uncommitted
proposal, etc.) — the skill layer (via the persistent Manager
receiving the injected string) takes full responsibility for those
decisions.

Only one prerequisite failure SHALL surface as a toast notification
from the UI: embedded terminal unavailable → "No embedded terminal
— open a change view to spawn one".

The UI SHALL NOT gate on `agents.yaml` contents. When `agents.yaml`
is empty or lacks a code-role entry, the dispatcher falls back to
Manager self-dispatch; all that decision-making lives in the skill
layer.

All other execution concerns (which CLI to spawn, whether to create
a worktree, what branch to commit on) are downstream of the
dispatcher and NOT the UI's responsibility.

#### Scenario: Start injects dispatch invocation
- **GIVEN** the embedded terminal is available
- **WHEN** the user clicks Start on a change
- **THEN** the flow opens the Apply CommandModal proposing `/ithy-opsx:dispatch <change-id>`, injects it into the terminal on submit, and shows no picker or worktree modal

#### Scenario: no worktree spawn from UI regardless of config
- **GIVEN** `parallelExecution: true` in `agents.yaml`
- **WHEN** the user clicks Start
- **THEN** the UI still only injects `/ithy-opsx:dispatch <id>` into the terminal — no `POST /api/agents/run` is issued from the Start flow

#### Scenario: no embedded terminal surfaces as toast
- **GIVEN** the embedded terminal is unavailable
- **WHEN** the user clicks Start
- **THEN** a toast reports "No embedded terminal — open a change view to spawn one" and no injection occurs

#### Scenario: empty agents.yaml does not gate Start
- **GIVEN** `agents.yaml` empty (`agents: []`) or missing a code-role entry
- **WHEN** the user clicks Start
- **THEN** the UI still injects `/ithy-opsx:dispatch <id>` — the dispatcher resolves the fallback to Manager self-dispatch

#### Scenario: per-change proposal.execution override ignored by UI
- **GIVEN** a change with `proposal.execution: worktree` in its frontmatter
- **WHEN** the user clicks Start
- **THEN** the UI still only injects `/ithy-opsx:dispatch <id>` — the override is a signal for the dispatcher to read, not for the UI to consume
