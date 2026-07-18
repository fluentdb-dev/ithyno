# Delta: dashboard — thread --model from entry.args to /agmsg spawn

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

2. **`entry.command == "claude"`** (Manager self-dispatch or a
   `mode: single-prompt` claude worker) — invoke the **Task tool**
   with the resolved prompt.

3. **Otherwise** — run as a **subprocess** using Bash with
   `<entry.command> <entry.args...> -p "<resolved-prompt>"` from the
   worker's `cwd` (worktree root when applicable).

**3-stage success contract** SHALL be applied per branch:

- The **agmsg branch** returns as soon as the peer is listening.
  Success is judged by artifact only:
  - `code` stage: poll `git log agent/<change-id>` for a new commit
    (5s interval, 15 min ceiling). Timeout → escalate `code stage
    agmsg worker did not commit within timeout`.
  - `review` / `verify` stages: poll `openspec/changes/<change-id>/
    review.md` for existence + parseable `verdict:` frontmatter (5s
    interval, 5 min ceiling). Timeout → escalate `<stage> agmsg
    worker did not produce review.md within timeout`.
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
- **THEN** it invokes `/agmsg spawn codex peer --boot-prompt "/ithy-opsx:review <change-id>"` (not the subprocess branch, not the Task tool)

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

#### Scenario: agmsg branch code stage waits for commit
- **GIVEN** an agmsg-routed code dispatch has been sent via `/agmsg spawn --boot-prompt`
- **WHEN** the dispatcher polls
- **THEN** it checks `git log agent/<change-id>` every 5 seconds; a new commit signals stage success and phase advances to `coded`

#### Scenario: agmsg branch review stage waits for review.md
- **GIVEN** an agmsg-routed review or verify dispatch has been sent via `/agmsg spawn --boot-prompt`
- **WHEN** the dispatcher polls
- **THEN** it checks `openspec/changes/<change-id>/review.md` every 5 seconds; presence + parseable `verdict:` frontmatter signals stage completion and routes on `pass`/`needs-rework`

#### Scenario: agmsg branch escalates on code timeout
- **GIVEN** an agmsg-routed code dispatch that has not produced a new commit on `agent/<change-id>` after 15 minutes
- **WHEN** the ceiling elapses
- **THEN** the dispatcher escalates with `code stage agmsg worker did not commit within timeout`

#### Scenario: agmsg branch escalates on review timeout
- **GIVEN** an agmsg-routed review or verify dispatch that has not produced `review.md` after 5 minutes
- **WHEN** the ceiling elapses
- **THEN** the dispatcher escalates with `<stage> agmsg worker did not produce review.md within timeout`

#### Scenario: agmsg branch threads --model from entry.args
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND a live-shell worker entry `{ name: claude, command: claude, args: [--dangerously-skip-permissions, --model, sonnet], roles: [code] }`
- **WHEN** the dispatcher reaches the code stage
- **THEN** it invokes `/agmsg spawn claude-code claude --model sonnet --boot-prompt "/ithy-opsx:apply <change-id>"` (the `--model sonnet` pair is extracted from `args` and threaded before `--boot-prompt`)

#### Scenario: agmsg branch omits --model when absent from args
- **GIVEN** an entry whose `args` does not contain `--model`
- **WHEN** the dispatcher reaches the stage
- **THEN** the spawn call is `/agmsg spawn <type> <name> --boot-prompt "..."` (no `--model` inserted) and the CLI starts on its default model

#### Scenario: agmsg branch escalates on bare --model
- **GIVEN** an entry whose `args` contains `--model` with no following token (e.g. `args: [--model]`)
- **WHEN** the dispatcher reaches the stage
- **THEN** it escalates with `agents.yaml agent "<name>" has bare --model without a value in args` and does NOT dispatch

