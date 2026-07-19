# Delta: dashboard — dispatcher instructs the review/verify worker where to write review.md

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
3. **When `parallelExecution === false`, before creating the worktree
   in step 2 above, acquire the `.worktrees/.lock` semaphore per the
   `Worktree Concurrency Semaphore` requirement.** If the lock is
   held by another change whose worktree still exists, escalate
   without creating a worktree.
4. Advance the change through `proposed → coded → reviewed → done`
   by dispatching workers in stages (code → review → verify), using
   the Dispatch helper protocol below and the 3-stage success
   contract for review/verify.
5. On verify `pass` (phase → done), release the `.worktrees/.lock`
   semaphore.
6. On any escalate path, release the `.worktrees/.lock` semaphore
   before exiting.

**Target artifact path**. Before dispatching, the skill SHALL
compute an absolute `<TARGET_PATH>` — the directory the worker
resolves `openspec/changes/<change-id>/review.md` inside:

- worktree mode → `<repo>/.worktrees/<change-id>` (absolute)
- main-tree mode → `<repo>` (absolute; the Manager's project root)

`<TARGET_PATH>` is used both in the worker's boot-prompt (artifact
contract, below) and by the Manager's own artifact judgment (below).

**Dispatch helper protocol** SHALL branch on the resolved worker
entry in the following priority order:

1. **`entry.mode == "live-shell"` AND `agents.yaml` contains a valid
   `agmsg` block** (see `Agmsg Config Block In agents.yaml`) — invoke:

   ```
   /agmsg spawn <agmsg-type> <entry.name> [--model <id>] --boot-prompt "<resolved-prompt>"
   ```

   Where `<agmsg-type>` is derived from `entry.command` via this
   fixed mapping: `claude → claude-code`, `codex → codex`,
   `copilot → copilot`, `gemini → gemini`,
   `antigravity → antigravity`, `opencode → opencode`,
   `cursor → cursor`. Any other `entry.command` SHALL escalate with
   `agmsg-type unknown for command: <cmd>` without dispatching.

   Before entering this branch, the skill SHALL verify agmsg's
   scripts exist at `~/.agents/skills/agmsg/scripts/send.sh`
   (presence check only). When absent, it SHALL fall through to
   the branches below and note "agmsg configured but not installed
   locally; falling back to non-agmsg dispatch" in its stdout so
   the user can install agmsg if desired.

   The skill SHALL scan `entry.args` for a `--model <id>` pair
   (order-agnostic within the args array). When found, the
   `--model <id>` pair SHALL be threaded into the spawn call before
   `--boot-prompt`. When absent, the spawn call omits `--model` and
   `spawn.sh` starts the CLI on its default model. When `--model`
   appears without a following token in `entry.args`, the skill
   SHALL escalate with `agents.yaml agent "<name>" has bare --model
   without a value in args` and NOT dispatch. Errors returned by
   `spawn.sh` (e.g. an agmsg-type whose manifest declares no
   `model_arg`) SHALL surface as-is with no silent fallback.

   Other `entry.args` (e.g. `--dangerously-skip-permissions`) are
   NOT threaded through the CLI here. Their sync into
   `~/.agmsg/config/spawn_options.yaml` is a **server-side**
   concern (config-writer), NOT a dispatcher-skill concern. See
   `sync-agmsg-spawn-options-on-config-write` (follow-up change)
   for that flow.

   **Artifact contract in the boot-prompt** (review / verify stages
   only). The resolved boot-prompt SHALL append an "artifact
   contract" section that names the exact absolute path where the
   worker MUST write `review.md`. The appended text SHALL be:

   ```
   --- artifact contract ---
   Write your review.md to this exact absolute path:
     <TARGET_PATH>/openspec/changes/<change-id>/review.md
   Do NOT rely on your CLI's cwd inference; the dispatcher will
   look at this exact path only. If the path's parent directory
   does not exist, create it first.
   ```

   The artifact contract SHALL NOT be appended for the code stage
   (no review.md write expected).

   **Report contract in the boot-prompt.** The resolved boot-prompt
   for the agmsg branch SHALL append a "report" section that
   instructs the worker to send exactly ONE completion message to
   Manager when it finishes (whether the outcome is pass,
   needs-rework, or a blocker). The appended text SHALL be:

   ```
   --- report contract ---
   When your task completes, send exactly ONE message to Manager via:
     ~/.agents/skills/agmsg/scripts/send.sh <team> <entry.name> manager \
       "stage:<S> status:done"
   This tells Manager to inspect the review.md artifact (or git log
   for code stage) and advance the workflow. Send exactly once.
   ```

   Where `<team>` is the value from `agents.yaml`'s `agmsg.team`
   field, `<entry.name>` is the worker's agent name, and `<S>` is
   the dispatched stage (`code`, `review`, or `verify`).

   Order: the artifact contract SHALL appear before the report
   contract when both are present, so a well-behaved worker writes
   review.md and only then sends the completion message.

2. **`entry.command == "claude"`** (Manager self-dispatch or a
   `mode: single-prompt` claude worker) — invoke the **Task tool**
   with the resolved prompt.

3. **Otherwise** — run as a **subprocess** using Bash with
   `<entry.command> <entry.args...> -p "<resolved-prompt>"` from the
   worker's `cwd` (worktree root when applicable).

**3-stage success contract** SHALL be applied per branch:

- The **agmsg branch** uses a **message-based wait** instead of
  polling. After sending the spawn, Manager waits (via the Monitor
  tool, or via periodic `inbox.sh` at 5-second intervals) for an
  inbox message matching:
  - `from:<entry.name>`
  - body matches regex `^stage:<S> status:done`

  Ceilings match the previous polling model: **15 min for the code
  stage, 5 min for review / verify**. On timeout → escalate
  `<stage> agmsg worker did not report within timeout`.

  On message receipt:
  - **`S = code`** — check `git log agent/<change-id>` head vs the
    pre-spawn head. If a new commit landed, advance phase to `coded`.
    If the head is unchanged but the tree has uncommitted worker
    output (staged or unstaged), Manager SHALL commit the tree on
    the agent branch as fallback and then advance. If neither
    condition holds (no worker output at all), escalate `code stage
    reported done but produced no changes`.
  - **`S = review` or `S = verify`** — read
    `<TARGET_PATH>/openspec/changes/<change-id>/review.md` (the
    same absolute path the boot-prompt's artifact contract named).
    Parse the frontmatter `verdict:` value. Route on
    `pass` / `needs-rework` per the unchanged logic. If the file is
    absent AFTER receiving the report message, retry the read once
    with a 1-second delay; if still absent, escalate `<stage>
    reported done but did not write review.md at <TARGET_PATH>/
    openspec/changes/<change-id>/review.md`.

  Duplicate messages from the same worker SHALL be ignored (Manager
  processes only the first matching message per stage).

- The **Task tool** and **subprocess** branches retain the current
  contract: subprocess non-zero exit → subprocess failure;
  subprocess exit 0 + review.md absent → contract failure;
  review.md present with parseable `verdict:` → route on
  `pass` / `needs-rework`.

Manager (`roles` includes `manager`) is never dispatched through
the agmsg branch — the Manager runs in tmux pane 0 (per `Embedded
PTY Uses tmux When Agmsg Is Configured`); its `/agmsg spawn` calls
are what land workers in adjacent panes.

MAX_ITERATIONS remains 5 for the code↔review loop. All other
existing behavior is retained.

#### Scenario: parallelExecution false — lock acquired before worktree
- **GIVEN** `parallelExecution: false` and no `.worktrees/.lock`
- **WHEN** the dispatcher runs for `change-A`
- **THEN** it writes the lock first, then creates `.worktrees/change-A/`

#### Scenario: parallelExecution false — lock held blocks dispatch
- **GIVEN** `parallelExecution: false` and `.worktrees/.lock` held by `change-A` with `.worktrees/change-A/` present
- **WHEN** the dispatcher runs for `change-B`
- **THEN** the dispatcher escalates with `Another change (change-A) is currently running.` and no `.worktrees/change-B/` is created

#### Scenario: verify pass releases lock
- **GIVEN** the dispatcher completes verify with `verdict: pass` under `parallelExecution: false`
- **WHEN** phase transitions to done
- **THEN** `.worktrees/.lock` is deleted

#### Scenario: escalation releases lock
- **GIVEN** the dispatcher escalates for any reason under `parallelExecution: false`
- **WHEN** the escalation runs
- **THEN** `.worktrees/.lock` is deleted before exit

#### Scenario: agmsg branch takes priority for live-shell workers
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a worker entry `{ name: peer, mode: live-shell, command: codex, roles: [review] }`
- **AND** agmsg scripts exist at `~/.agents/skills/agmsg/scripts/send.sh`
- **WHEN** the dispatcher runs the review stage
- **THEN** it invokes `/agmsg spawn codex peer --boot-prompt "<resolved-prompt with artifact + report contracts>"` (not the subprocess branch, not the Task tool)

#### Scenario: agmsg branch skipped for single-prompt workers
- **GIVEN** `agents.yaml` has an `agmsg:` block AND a worker entry `{ name: coder, mode: single-prompt, command: claude, roles: [code] }`
- **WHEN** the dispatcher runs the code stage
- **THEN** it takes the Task tool branch (mode is single-prompt, not live-shell); no `/agmsg spawn` is invoked

#### Scenario: agmsg branch escalates on unknown command
- **GIVEN** `agents.yaml` has an `agmsg:` block AND a worker entry `{ name: custom, mode: live-shell, command: my-wrapper, roles: [review] }`
- **WHEN** the dispatcher reaches the review stage
- **THEN** it escalates with `agmsg-type unknown for command: my-wrapper` and does NOT dispatch

#### Scenario: agmsg missing locally falls through
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a live-shell worker
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` does NOT exist (agmsg not installed)
- **WHEN** the dispatcher reaches the stage
- **THEN** it logs "agmsg configured but not installed locally; falling back to non-agmsg dispatch" and takes the Task tool or subprocess branch as if no `agmsg:` block were present

#### Scenario: agmsg branch code stage advances on report message
- **GIVEN** an agmsg-routed code dispatch to worker `claude`
- **WHEN** Manager receives an inbox message `from:claude body:"stage:code status:done"` within the 15-min ceiling
- **THEN** Manager checks `git log agent/<change-id>` — if a new commit landed, phase advances to `coded`; if not but the tree has uncommitted changes, Manager commits as fallback and advances

#### Scenario: agmsg branch review stage advances on report + review.md
- **GIVEN** an agmsg-routed review dispatch to worker `copilot-review`
- **WHEN** Manager receives `from:copilot-review body:"stage:review status:done"` and reads `review.md` at `<TARGET_PATH>/openspec/changes/<change-id>/review.md` with parseable `verdict: pass`
- **THEN** Manager advances the change to `reviewed`

#### Scenario: agmsg branch escalates on missing report message
- **GIVEN** an agmsg-routed dispatch has spawned a worker
- **WHEN** no `stage:<S> status:done` message from that worker arrives within the ceiling (15 min code / 5 min review-verify)
- **THEN** Manager escalates with `<stage> agmsg worker did not report within timeout`

#### Scenario: agmsg branch retries artifact read on race
- **GIVEN** Manager received `stage:review status:done` from the worker
- **AND** `<TARGET_PATH>/openspec/changes/<change-id>/review.md` is temporarily absent when Manager first tries to read it (worker sent the message just before its file was flushed)
- **WHEN** Manager retries the read once after a 1-second delay
- **THEN** the file is now present and Manager parses the verdict as usual

#### Scenario: agmsg branch ignores duplicate report messages
- **GIVEN** Manager already processed `stage:code status:done` from worker `claude`
- **WHEN** a second identical message arrives from the same worker for the same stage
- **THEN** Manager ignores the duplicate and does NOT re-advance the phase

#### Scenario: agmsg branch threads --model from entry.args
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a live-shell worker entry `{ name: claude, command: claude, args: [--dangerously-skip-permissions, --model, sonnet], roles: [code] }`
- **WHEN** the dispatcher reaches the code stage
- **THEN** it invokes `/agmsg spawn claude-code claude --model sonnet --boot-prompt "<resolved-prompt with report contract>"` (the `--model sonnet` pair is extracted from `args` and threaded before `--boot-prompt`)

#### Scenario: agmsg branch omits --model when absent from args
- **GIVEN** an entry whose `args` does not contain `--model`
- **WHEN** the dispatcher reaches the stage
- **THEN** the spawn call is `/agmsg spawn <type> <name> --boot-prompt "..."` (no `--model` inserted) and the CLI starts on its default model

#### Scenario: agmsg branch escalates on bare --model
- **GIVEN** an entry whose `args` contains `--model` with no following token (e.g. `args: [--model]`)
- **WHEN** the dispatcher reaches the stage
- **THEN** it escalates with `agents.yaml agent "<name>" has bare --model without a value in args` and does NOT dispatch

#### Scenario: worktree mode → boot-prompt names the worktree absolute path
- **GIVEN** worktree mode with `<repo>/.worktrees/<change-id>/` created
- **WHEN** the dispatcher builds the boot-prompt for the review stage
- **THEN** the artifact contract section names `<repo-absolute>/.worktrees/<change-id>/openspec/changes/<change-id>/review.md` as the target path

#### Scenario: main-tree mode → boot-prompt names the repo root path
- **GIVEN** main-tree mode (no worktree)
- **WHEN** the dispatcher builds the boot-prompt for the review stage
- **THEN** the artifact contract section names `<repo-absolute>/openspec/changes/<change-id>/review.md` as the target path

#### Scenario: worker writes review.md to the wrong path → escalate
- **GIVEN** worktree mode; the worker completed and sent `stage:review status:done`
- **AND** review.md is not present at `<TARGET_PATH>/openspec/changes/<change-id>/review.md` (worker ignored the artifact contract and wrote elsewhere)
- **WHEN** Manager checks the artifact after the 1-second retry
- **THEN** Manager escalates with `review reported done but did not write review.md at <TARGET_PATH>/openspec/changes/<change-id>/review.md`

#### Scenario: code stage boot-prompt has NO artifact contract
- **GIVEN** the code stage boot-prompt is built
- **WHEN** the resolved-prompt is assembled
- **THEN** it contains the report contract but NOT the artifact contract (no review.md write expected in the code stage)
