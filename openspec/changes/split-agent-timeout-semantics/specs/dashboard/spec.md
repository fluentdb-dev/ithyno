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
4. **Manager registration guard.** When `agents.yaml` contains a valid
   `agmsg:` block, the skill SHALL idempotently register Manager in
   the team at dispatch start (before any worker spawn).

   The team name SHALL be extracted from `agents.yaml` using a
   POSIX-portable form (BSD sed on macOS rejects GNU sed's
   address-block `{...}` syntax). Recommended: awk.

   ```bash
   AGMSG_TEAM=$(awk '
     /^agmsg:/ { in_block=1; next }
     in_block && /^[^ ]/ { in_block=0 }
     in_block && /^  team:/ { sub(/^  team:[[:space:]]*/, ""); print; exit }
   ' agents.yaml)

   ~/.agents/skills/agmsg/scripts/join.sh "$AGMSG_TEAM" manager \
     claude-code "$(pwd)"
   ```

   `join.sh` is idempotent — safe to invoke when Manager is already
   registered. This closes the class of failure where prior cleanup
   operations dropped Manager's registration silently.

   Additionally, before each stage's spawn (code / review / verify),
   the skill SHALL verify Manager is still a team member via
   `team.sh` and re-invoke `join.sh` when Manager is absent. The
   check is cheap and defends against cross-stage drift.

   Portable extraction is normative: the skill SHALL NOT use GNU-
   only sed syntax (e.g. address-block `{}` in `-n` mode). Any
   `$AGMSG_TEAM` extraction inside the agmsg branch body SHALL
   also follow this rule.

5. Advance the change through `proposed → coded → reviewed → done`
   by dispatching workers in stages (code → review → verify), using
   the Dispatch helper protocol below and the 3-stage success
   contract for review/verify.
6. On verify `pass` (phase → done), release the `.worktrees/.lock`
   semaphore.
7. On any escalate path, release the `.worktrees/.lock` semaphore
   before exiting.
8. Resolve the layered timeout policy from top-level `agents.yaml.timeouts`,
   optional per-Agent overrides, and the dispatched role. The same resolved
   values SHALL be passed to every execution branch and SHALL replace branch-
   specific fixed ceilings.

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

   The boot-prompt SHALL additionally instruct long-running workers to send
   bounded working heartbeats with body
   `stage:<S> status:working change:<change-id>`. A heartbeat is optional when
   another qualifying activity source has occurred within `idleSeconds`, and
   it MUST NOT be emitted more frequently than the supervisor poll interval.

   Order: the artifact contract SHALL appear before the report
   contract when both are present, so a well-behaved worker writes
   review.md and only then sends the completion message.

   **Worker MUST NOT commit.** The dispatched code worker's role is
   apply-only. The `agents.yaml` example / default code prompt for
   command `claude` SHALL be `/opsx:apply ${change_id}` (apply
   only). The self-committing `/ithy-opsx:apply` variant is NOT
   supported as a dispatched worker prompt — its interactive
   "commit OK?" confirmation cannot be answered from an agmsg
   pane, causing the stage to hang until an idle or hard deadline. Manager owns
   the commit (see the code-stage judgment in the 3-stage success
   contract below).

   **Iteration for Copilot workers**. When the review stage returns
   `needs-rework`, the skill iterates. For agmsg workers whose
   agmsg-type has no receive-side Monitor equivalent (currently
   `copilot`), iteration SHALL be a fresh `/agmsg spawn` per
   iteration — the skill MUST NOT use `send.sh` to hand a mid-
   iteration prompt to an already-spawned copilot worker (Copilot
   has no Monitor tool; the message would sit in the inbox unread
   until Copilot's next user-triggered turn, which the dispatcher
   cannot cause). For agmsg types with a receive-side Monitor
   (currently `claude-code`), the skill MAY optionally reuse an
   existing worker via `send.sh` for iteration N+1 instead of
   fresh spawn; that optimization is a follow-up and not
   normative today.

2. **`entry.command == "claude"`** (Manager self-dispatch or a
   `mode: single-prompt` claude worker) — invoke the **Task tool**
   with the resolved prompt.

   For review / verify stages, the resolved prompt SHALL include
   the same absolute-path artifact contract used by the agmsg
   branch (naming `<TARGET_PATH>/openspec/changes/<change-id>/
   review.md`). This gives the Task tool subagent an unambiguous
   write target matching where Manager reads.

3. **Otherwise** — run as a **subprocess** using Bash with
   `<entry.command> <entry.args...> -p "<resolved-prompt>"` from the
   worker's `cwd` (worktree root when applicable).

   For review / verify stages, the resolved prompt SHALL include
   the absolute-path artifact contract (identical wording to the
   agmsg branch's contract). Some CLIs — notably `copilot` — do
   not honor their process cwd for file writes and default to a
   discovered project root; the artifact contract removes that
   ambiguity by naming the exact absolute path. Without the
   contract, a subprocess reviewer may write `review.md` to the
   main tree in worktree mode, causing Manager's post-report
   read to fail with `<stage> returned no artifact`.

**3-stage success contract** SHALL be applied per branch:

- The **agmsg branch** uses a **message-based wait** instead of
  polling. After sending the spawn, Manager waits (via the Monitor
  tool, or via periodic `inbox.sh` at 5-second intervals) for an
  inbox message matching:
  - `from:<entry.name>`
  - body matches regex `^stage:<S> status:done`

  Waiting SHALL use the shared layered timeout supervisor rather than a single
  fixed polling ceiling. A successful `/agmsg spawn` acknowledges startup. A
  matching `stage:<S> status:working change:<change-id>` heartbeat is qualifying
  activity; repeated inbox polling without a heartbeat is not. The completion
  message ends implementation monitoring but does not bypass artifact grace.

  The supervisor SHALL distinguish `startup-timeout`,
  `first-activity-timeout`, `idle-timeout`, `hard-timeout`, `native-timeout`,
  and `artifact-timeout`. Activity SHALL reset only the idle timer and SHALL
  NOT extend the resolved role-specific hard deadline.

  On message receipt:
  - **`S = code`** — Manager SHALL check the working tree of
    `agent/<change-id>`. If the tree has uncommitted worker output
    (staged or unstaged), Manager SHALL commit unconditionally on
    `agent/<change-id>` with subject `impl: <change-id>` and then
    advance phase to `coded`. If the tree is clean AND no new
    commit exists on `agent/<change-id>` beyond the pre-spawn
    head, escalate `code stage reported done but produced no
    changes`. Worker-side commits are NOT expected under this
    contract; when the worker does commit (e.g. via a non-default
    self-committing apply variant), Manager's tree check finds a
    clean tree AND a new commit — this counts as success and
    Manager's own commit step is a no-op (nothing to stage). No
    duplicate commits.
  - **`S = review` or `S = verify`** — read
    `<TARGET_PATH>/openspec/changes/<change-id>/review.md` (the
    same absolute path the boot-prompt's artifact contract named).
    Parse the frontmatter `verdict:` value. Route on
    `pass` / `needs-rework` per the unchanged logic. If the file is
    absent AFTER receiving the report message, wait and retry until the
    resolved `artifactGraceSeconds` deadline. If still absent, return
    `artifact-timeout` and escalate `<stage> reported done but did not write
    review.md at <TARGET_PATH>/openspec/changes/<change-id>/review.md`.

  Duplicate messages from the same worker SHALL be ignored (Manager
  processes only the first matching message per stage).

- The **Task tool** and **subprocess** branches SHALL use the same layered
  timeout supervisor. Spawn/tool acknowledgement ends startup monitoring;
  streamed output, runner progress, and scoped worktree mutations provide
  activity. CLI-native timeout flags SHALL be aligned or disabled so they do
  not expire before ithyno's resolved hard deadline. A vendor timeout that
  still occurs SHALL be reported as `native-timeout` with whether prior
  activity was observed.

  These branches retain their exit-code contract but resolve the artifact
  against the same absolute path as the agmsg branch: subprocess non-zero exit
  (or Task-tool subagent failure) → failure; exit 0 + `review.md` absent after
  `artifactGraceSeconds` at `<TARGET_PATH>/openspec/changes/<change-id>/review.md`
  → `artifact-timeout` contract failure → escalate `<stage> returned no
  artifact`; present with parseable `verdict:` → route on
  `pass` / `needs-rework`.

  Manager SHALL read the artifact at `<TARGET_PATH>/openspec/
  changes/<change-id>/review.md` (absolute path, computed in step
  4) for all three branches — agmsg, Task tool, subprocess. The
  older relative form (`openspec/changes/<change-id>/review.md`
  from Manager's cwd) is not compliant in worktree mode because
  Manager's cwd is the project root, not the worktree — a
  well-behaved reviewer honoring its process cwd would write to
  the worktree and Manager's read would miss it.

Manager (`roles` includes `manager`) is never dispatched through
the agmsg branch — the Manager runs in tmux pane 0 (per `Embedded
PTY Uses tmux When Agmsg Is Configured`); its `/agmsg spawn` calls
are what land workers in adjacent panes.

**Failure recovery ladder.** When a stage fails or the dispatch
ends (whether successfully, via escalation, or via a hung worker),
the skill SHALL clean up worker panes and team memberships using
the following ordered ladder. Each step is tried in order; on
failure, fall through to the next step; escalate with a message
naming the leaked resource only after step 3 fails.

1. **Preferred — graceful despawn.**

   ```bash
   ~/.agents/skills/agmsg/scripts/despawn.sh "$AGMSG_TEAM" manager "$entry_name"
   ```

   Releases the tmux pane placement AND the team member entry in
   one atomic operation. This is the correct path when spawn
   recorded a placement (the normal case).

2. **On despawn failure — targeted leave + kill.**

   ```bash
   ~/.agents/skills/agmsg/scripts/leave.sh "$AGMSG_TEAM" "$entry_name"
   tmux kill-pane -t "$WORKER_PANE_ID"
   ```

   Removes the specific agent from the team AND kills the specific
   pane. Used when despawn fails because `spawn.sh` did not
   register a placement (e.g. the known `run/spawn.<team>__<name>`
   first-invocation mkdir gap). Scope is exactly one agent, one
   pane — no collateral damage.

3. **NEVER — bare `reset.sh`.** The skill SHALL NOT invoke
   `reset.sh "$path" <type>` without an `agent_id` argument in any
   recovery path. Without `agent_id`, `reset.sh` clears every
   agent of that type registered under that project path — which
   can include Manager itself, silently taking down the dispatch
   loop's own reply channel. Full-team resets are a manual
   operator escape hatch, not a skill responsibility.

   If step 2 also fails (leave.sh errors AND the pane won't die),
   escalate with `stage <S> cleanup failed — leaked pane
   <pane-id>, leaked team member <entry.name>` so the operator can
   inspect manually. Do NOT silently fall through to a bare
   `reset.sh` as a "just make it go away" catch-all.

Timeout recovery SHALL follow the timeout class. Startup and first-activity
timeouts retry the configured Agent once. Idle timeout SHALL preserve partial
work and pass a resume warning to Manager fallback. Hard timeout SHALL enter
Manager fallback or escalation without an identical automatic retry. Artifact
timeout SHALL remain an artifact contract failure. Every timeout result SHALL
include its kind, elapsed runtime, last activity when present, Agent, role, and
whether partial work exists.

MAX_ITERATIONS remains 5 for the code↔review loop. All other existing behavior
is retained.

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

#### Scenario: Manager registration ensured at dispatch start
- **GIVEN** `agents.yaml` has a valid `agmsg:` block AND Manager (`manager`) is NOT currently registered in the team
- **WHEN** the dispatcher starts for change `add-foo`
- **THEN** the skill invokes `join.sh openspec-ui manager claude-code "$(pwd)"` before any worker spawn, and Manager appears in `team.sh openspec-ui` output when the code stage begins

#### Scenario: Manager registration re-verified before each stage
- **GIVEN** dispatch is between stages (code completed, review about to spawn) AND Manager's registration was removed by an external process
- **WHEN** the skill enters the review stage
- **THEN** the pre-spawn `team.sh` check finds Manager absent, `join.sh` is re-invoked, and Manager is registered again before `/agmsg spawn` fires

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

#### Scenario: code stage — Manager commits worker's uncommitted output
- **GIVEN** an agmsg-routed code dispatch to worker `claude` with the default `/opsx:apply ${change_id}` prompt (apply only)
- **WHEN** Manager receives `from:claude body:"stage:code status:done"` before the resolved hard deadline
- **AND** the `agent/<change-id>` working tree has uncommitted changes (worker applied but did not commit)
- **THEN** Manager runs `git -C .worktrees/<change-id> add . && git commit -m "impl: <change-id>"`, and phase advances to `coded`

#### Scenario: code stage — worker-committed tree treated as no-op
- **GIVEN** an agmsg-routed code dispatch with a self-committing worker variant
- **WHEN** Manager receives `stage:code status:done` and the `agent/<change-id>` tree is clean AND a new commit exists beyond the pre-spawn head
- **THEN** Manager's commit step is a no-op (nothing to stage), no duplicate commit is created, and phase advances to `coded`

#### Scenario: code stage — escalate when no changes produced
- **GIVEN** an agmsg-routed code dispatch
- **WHEN** Manager receives `stage:code status:done` AND the tree is clean AND no new commit exists beyond the pre-spawn head
- **THEN** Manager escalates with `code stage reported done but produced no changes` and does NOT advance the phase

#### Scenario: agmsg branch review stage advances on report + review.md
- **GIVEN** an agmsg-routed review dispatch to worker `copilot-review`
- **WHEN** Manager receives `from:copilot-review body:"stage:review status:done"` and reads `review.md` at `<TARGET_PATH>/openspec/changes/<change-id>/review.md` with parseable `verdict: pass`
- **THEN** Manager advances the change to `reviewed`

#### Scenario: agmsg worker never reports first activity
- **GIVEN** an agmsg-routed dispatch successfully spawned a worker
- **WHEN** no valid working heartbeat, scoped worktree mutation, or completion message arrives before `firstActivitySeconds`
- **THEN** Manager classifies the attempt as `first-activity-timeout`
- **AND** retries the configured worker at most once before applying Manager fallback

#### Scenario: agmsg worker remains active beyond the idle duration
- **GIVEN** an agmsg-routed code worker sends valid working heartbeats before every idle deadline
- **WHEN** total runtime exceeds `idleSeconds`
- **THEN** Manager continues waiting
- **AND** the role-specific hard deadline remains unchanged

#### Scenario: agmsg worker becomes idle after progress
- **GIVEN** an agmsg-routed worker previously sent valid activity
- **WHEN** no further activity arrives for `idleSeconds`
- **THEN** Manager classifies the attempt as `idle-timeout`
- **AND** preserves and reports any partial worktree changes

#### Scenario: active agmsg worker reaches hard runtime
- **GIVEN** an agmsg-routed worker continues sending valid activity
- **WHEN** its role-specific `hardSeconds` deadline expires
- **THEN** Manager classifies the attempt as `hard-timeout`
- **AND** does not retry the same worker with identical input

#### Scenario: agmsg branch waits through artifact grace on race
- **GIVEN** Manager received `stage:review status:done` from the worker
- **AND** `<TARGET_PATH>/openspec/changes/<change-id>/review.md` is temporarily absent when Manager first tries to read it (worker sent the message just before its file was flushed)
- **WHEN** Manager retries reads within `artifactGraceSeconds`
- **THEN** the file is now present and Manager parses the verdict as usual

#### Scenario: agmsg artifact grace expires
- **GIVEN** Manager received `stage:review status:done` from the worker
- **AND** `review.md` remains absent
- **WHEN** `artifactGraceSeconds` expires
- **THEN** Manager classifies the result as `artifact-timeout`
- **AND** reports an artifact contract failure rather than implementation inactivity

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

#### Scenario: Copilot worker iteration means fresh spawn
- **GIVEN** an agmsg-routed review with worker `{ name: copilot-review, command: copilot, mode: live-shell }` that returned `verdict: needs-rework`
- **WHEN** the dispatcher runs the next iteration
- **THEN** it invokes `/agmsg spawn copilot copilot-review --boot-prompt "<new resolved-prompt with priorFindings + artifact + report contracts>"` — a FRESH spawn creating a new tmux pane; it does NOT call `send.sh` to hand the new prompt to an existing copilot session

#### Scenario: Claude worker iteration MAY reuse (informative)
- **GIVEN** an agmsg-routed dispatch with worker `{ name: coder, command: claude, mode: live-shell }` that returned `verdict: needs-rework`
- **WHEN** the dispatcher decides on the next iteration
- **THEN** the skill MAY either fresh-spawn a new worker OR send the new prompt to the existing worker (Claude Code has Monitor, so send-based iteration is technically supported); either choice is compliant with this requirement in the current version

#### Scenario: cleanup prefers despawn
- **GIVEN** the review stage completes (pass or needs-rework) and the copilot-review worker's pane is still open
- **WHEN** the skill runs its post-stage cleanup
- **THEN** it invokes `despawn.sh openspec-ui manager copilot-review` FIRST; the pane closes and copilot-review is removed from the team in one operation

#### Scenario: cleanup falls back to leave + kill when despawn fails
- **GIVEN** `despawn.sh` fails because `spawn.sh` did not record a placement (first-invocation `run/` dir gap)
- **WHEN** the skill runs its post-stage cleanup
- **THEN** it invokes `leave.sh openspec-ui copilot-review` AND `tmux kill-pane -t <worker-pane-id>` — one specific agent, one specific pane — and Manager's registration is unaffected

#### Scenario: cleanup never invokes bare reset.sh
- **GIVEN** dispatch has escalated and is about to exit
- **WHEN** the skill runs its final cleanup pass
- **THEN** it does NOT invoke `reset.sh "$path" claude-code` (missing `agent_id`); if steps 1 and 2 of the recovery ladder both fail, the skill escalates with a message naming the leaked pane and team member, but does not attempt to clear the whole `(project, type)` slice

#### Scenario: portable AGMSG_TEAM extraction on BSD sed
- **GIVEN** `agents.yaml` has an `agmsg:` block with `team: openspec-ui`
- **AND** the running shell is macOS bash 3.2 with BSD sed
- **WHEN** the skill extracts `$AGMSG_TEAM`
- **THEN** the value is `openspec-ui` (extraction uses awk or another POSIX-portable form; no GNU-only sed address-block syntax)

#### Scenario: subprocess review branch names absolute artifact path
- **GIVEN** worktree mode with `copilot-review` (`mode: single-prompt`, `command: copilot`)
- **WHEN** the dispatcher enters the review stage
- **THEN** the `-p` prompt handed to `copilot` contains the artifact contract block naming `<TARGET_PATH>/openspec/changes/<change-id>/review.md` as the absolute write target

#### Scenario: Task tool review branch names absolute artifact path
- **GIVEN** worktree mode with a `mode: single-prompt` claude review worker
- **WHEN** the dispatcher enters the review stage
- **THEN** the Task tool prompt contains the same artifact contract block, naming the absolute path

#### Scenario: Manager reads review.md from TARGET_PATH not cwd
- **GIVEN** worktree mode; the review worker (any branch) wrote `review.md` at `<TARGET_PATH>/openspec/changes/<change-id>/review.md`
- **WHEN** Manager reads the artifact after the report / subprocess completion
- **THEN** Manager reads exactly that absolute path — NOT the relative `openspec/changes/<change-id>/review.md` under Manager's cwd (project root, main tree)
