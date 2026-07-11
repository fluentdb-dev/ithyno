## ADDED Requirements

### Requirement: Manager Loop Slash Command

The `/opsx:manage <change-id>` slash command SHALL exist as a prompt template that instructs a Claude Code session to run the Manager orchestration loop for the change: read change context, iterate over `dispatch code → dispatch review` pairs until the review verdict is `"pass"`, then `dispatch verify` once, and update the change's phase via `POST /api/changes/:id/phase` on each successful transition (`coded → reviewed → done`). The template SHALL bound iterations at a hard-coded MAX_ITERATIONS constant (default 5) and SHALL escalate the change to `needs-human` when the loop fails to converge, when any worker returns a non-`completed` status, or when a review or verify returns without a structured verdict.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/manage.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives the change id as its argument, and follows the manager-loop instructions

#### Scenario: convergence loop with pass verdict
- **GIVEN** a change whose `dispatch code → dispatch review` cycle produces `verdict: pass` on iteration 1
- **WHEN** the Manager follows the template
- **THEN** it sets phase to `coded`, then `reviewed` after review pass, dispatches verify, then sets phase to `done` on verify pass — all within one iteration

#### Scenario: needs-rework retries with findings
- **GIVEN** a review that returns `verdict: needs-rework` with 2 findings
- **WHEN** the Manager follows the template
- **THEN** it re-dispatches `code` with the findings serialized into `promptSuffix`, then re-dispatches `review` — the loop continues until `pass` or MAX_ITERATIONS is reached

#### Scenario: convergence loop cap
- **GIVEN** a review that keeps returning `verdict: needs-rework` on every iteration
- **WHEN** the Manager reaches MAX_ITERATIONS (default 5) without a pass verdict
- **THEN** the Manager invokes `/opsx:escalate <change-id> "Manager loop did not converge after 5 iterations"` and exits

#### Scenario: worker failure escalates
- **GIVEN** a `dispatch code` that returns `status: failed`
- **WHEN** the Manager follows the template
- **THEN** it escalates via `/opsx:escalate <change-id> "code worker failed: <reason>"` and exits without further dispatches

#### Scenario: missing verdict escalates
- **GIVEN** a review dispatch that returns without a `verdict` field
- **WHEN** the Manager follows the template
- **THEN** it escalates with reason "review returned no verdict" and exits

#### Scenario: already-done change exits early
- **GIVEN** a change whose current phase is already `done`
- **WHEN** the Manager reads the current phase
- **THEN** it exits without any dispatch, reporting "change already at phase: done"

#### Scenario: needs-human change is not restarted
- **GIVEN** a change whose current phase is `needs-human`
- **WHEN** the Manager reads the current phase
- **THEN** it exits without any dispatch, reporting "change is in needs-human — answer required before Manager can proceed"

### Requirement: Code Worker Slash Command

The `/opsx:code <change-id>` slash command SHALL exist as a prompt template that instructs a Claude Code session to read the change's proposal, tasks, and specs, apply the `promptSuffix` provided by the caller (typically the Manager passing review findings), implement or fix the change's outstanding tasks in the worktree, and commit the resulting changes on the agent branch. On any hard failure (schema violation, missing dependency, unsatisfiable requirement) the worker SHALL invoke `/opsx:escalate` and exit rather than committing partial or incorrect work.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/opsx/code.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads, receives the change id as its argument, and follows the code-worker instructions

#### Scenario: commits changes on success
- **GIVEN** a change whose tasks the worker can implement
- **WHEN** the worker follows the template
- **THEN** it writes the code and creates a git commit on the agent branch

#### Scenario: promptSuffix findings inform the work
- **GIVEN** a Manager-initiated dispatch that includes a `promptSuffix` listing review findings
- **WHEN** the worker follows the template
- **THEN** the worker's plan incorporates the findings (fixes specific files / lines mentioned) before proceeding

#### Scenario: schema failure escalates instead of committing garbage
- **GIVEN** an unsatisfiable task (missing dependency, invalid spec)
- **WHEN** the worker encounters the failure
- **THEN** it invokes `/opsx:escalate <change-id> "<reason>"` and exits without committing partial changes
