
Dispatch the code / review / verify workers for the given change.
This is the prompt the persistent Manager (a `claude` live-shell
session declared in `agents.yaml` with `roles: [manager]`) evaluates
when the Kanban Start button injects the string into the terminal
PTY.

The dispatch advances the change through `proposed → coded → reviewed
→ done` by:

1. Resolving execution mode (worktree vs main tree) from
   `agents.yaml.parallelExecution` + change's `proposal.execution`
   override.
2. Setting up the worktree if needed (idempotent).
3. Dispatching each stage's worker via the **Dispatch helper protocol**
   (native Task/Agent tool when Manager and worker share the same canonical CLI
   and a native adapter is available; server AgentRunner subprocess otherwise).
4. Judging review / verify by the **3-stage success contract**.
5. Looping code↔review until pass or MAX_ITERATIONS; escalating on
   non-convergence.

**Input**: `$ARGUMENTS` is the change id.

**Constants**:

- `MAX_REWORK_ROUNDS` — the code ↔ review loop halts and escalates
  after this many attempts. Read from `agents.yaml` at dispatch time:

  ```bash
  MAX_REWORK_ROUNDS=$(awk '
    /^maxReworkRounds:/ { sub(/^maxReworkRounds:[[:space:]]*/, ""); print; exit }
  ' agents.yaml)
  # Fallback to 5 when absent or non-numeric:
  if ! echo "$MAX_REWORK_ROUNDS" | grep -qE '^[0-9]+$'; then
    MAX_REWORK_ROUNDS=5
  fi
  ```

  Default `5`. Valid range `[1, 10]`. Out-of-range values are clamped
  server-side with a warning (see `validateMaxReworkRounds` in
  `server/agents/registry.ts`) and surfaced via `GET /api/agents/config`
  as `maxReworkRounds`. The awk read above applies only when the Manager
  reads `agents.yaml` directly; the server-resolved value is the
  canonical one.

- `ITHYNO_BASE` — base URL of the local ithyno server. The Electron
  shell and VSCode extension each spawn the server on an ephemeral
  per-project port and export `ITHYNO_PORT` + `ITHYNO_BASE` into the
  Manager PTY, so `$ITHYNO_BASE` is already resolved. In the CLI dev
  workflow (no parent shell), fall back to
  `${ITHYNO_BASE:-http://localhost:${ITHYNO_PORT:-4321}}`.
  Every `curl` block below uses `$ITHYNO_BASE` as-is — Manager MUST
  read the shell's env, NOT hardcode 4321.

- `ITHYNO_SESSION_TOKEN` — the ithyno server's per-process session
  token. Required by every token-gated endpoint, including
  `POST /api/manager/activity` (see **Manager activity publication**
  below). The server exports it into the Manager PTY's environment at
  spawn time, so in the normal case it is already set and you do
  nothing. Verify once at dispatch start:

  ```bash
  if [ -z "$ITHYNO_SESSION_TOKEN" ]; then
    echo "[dispatch] ITHYNO_SESSION_TOKEN unset — Manager activity will not be published."
    echo "[dispatch] It is exported into the terminal PTY by the ithyno server;"
    echo "[dispatch] if you launched this shell outside the dashboard terminal,"
    echo "[dispatch] copy the token from the launch URL (…/?token=<token>)."
  fi
  ```

  A missing token is NOT a dispatch blocker — activity publication is
  best-effort telemetry. Continue the dispatch either way.

## Manager activity publication

The dashboard shows a per-card badge for what Manager itself is doing
between worker spawns (`dispatching` → `waiting` → `judging` →
`cleanup` → `transitioning` → cleared). That badge is fed ONLY by this
skill posting at each boundary. Landed by
`expose-manager-activity-per-change`.

Define the helper once, near the top of the dispatch run:

```bash
postManagerActivity() {
  # $1 = JSON body: {"changeId":…,"stage":"code|review|verify",
  #                  "activity":"dispatching|waiting|judging|cleanup|
  #                              transitioning|idle","detail":"…"}
  # Best-effort: never let a telemetry failure abort the dispatch.
  [ -n "$ITHYNO_SESSION_TOKEN" ] || return 0
  curl -sS -X POST "$ITHYNO_BASE/api/manager/activity" \
    -H 'content-type: application/json' \
    -H "X-Session-Token: $ITHYNO_SESSION_TOKEN" \
    -d "$1" >/dev/null 2>&1 || true
}
```

Rules:

- **State is in-memory server-side.** Nothing is persisted; a server
  restart clears every badge. Do not treat a lost badge as an error.
- **`activity: "idle"` clears the entry.** It is the only way to
  remove a badge, and `stage` may be omitted on that post.
- **Post exactly once per boundary.** The server broadcasts a WS
  event on every accepted write; a chatty loop is visible noise.
  Re-posting the same `stage` + `activity` (e.g. refreshing
  `waiting`'s detail with an elapsed hint) preserves the badge's
  elapsed clock, so it is safe but rarely needed.
- **Always reach the final `idle` post.** Success, escalation, and
  timeout all end with a clear — see the exit paths in **Steps**.

## Dispatch helper protocol (referenced by every stage)

For each stage `S ∈ {code, review, verify}`:

1. **Resolve the agent entry** from `agents.yaml`. Pick the first
   entry whose `roles` array includes `S`.

   ```bash
   # Rough shape (implement with sed/yq in Bash):
   entry = agents.yaml.agents.find(a => a.roles.includes(S))
   ```

   - **No entry found** for `S = code` → fall back to **Manager
     self-dispatch**: see **Manager fallback semantics** below.
   - **No entry found** for `S = review` or `S = verify` → fall back
     to **Manager self-dispatch** (same rules as code) OR escalate
     with `no agent declared for role: <S>` if the Manager cannot
     perform the work itself (e.g. reviewer independence is required
     by policy). Default is Manager fallback; escalate only when
     explicitly configured to.

   ### Manager fallback semantics

   "Manager self-dispatch" and "Manager fallback" refer to the same
   thing: the Manager (this Claude session) performs the stage's
   work directly, in-session, instead of routing to a configured
   worker CLI. This applies both when no agent entry exists for `S`
   AND when the configured agent fails at runtime after retries
   (sandbox block, API timeout, network error, missing binary).

   The rules for Manager fallback are uniform across ALL stages
   (`code`, `review`, `verify`):

   - **Execution mode: sequential.** The Manager is a single
     process/session. In-Manager execution (Bash, Read, Edit, Write,
     etc.) runs one operation at a time — there is no wall-clock
     gain from firing "parallel" Manager work. Even for multi-change
     dispatch, if the Manager is the fallback executor, walk changes
     one at a time.
   - **Distinct from Manager-spawned subagents.** When the Manager
     invokes the Task tool to spawn a subagent (e.g., the `code`
     stage's Manager-fallback path spawning a fresh Claude Code
     instance), that IS a form of ad-hoc agent definition, NOT
     Manager fallback. Subagent spawn CAN run in parallel — it
     follows the standard dispatch parallelism rules. The key
     distinguisher is *who executes the work*: the Manager itself
     (fallback, sequential) vs a distinct subagent instance the
     Manager spawned (agent-like, parallel-eligible).
   - **Runtime failure fallback ladder** (when a configured agent
     fails):
     1. Retry the configured agent once (transient network/API
        error).
     2. If still failing, invoke Manager fallback for the stage —
        Manager performs the work in-session and writes the same
        artifact contract the configured agent would have written
        (e.g., review.md at `$REVIEW_MD_PATH` with `verdict:` in
        frontmatter). Log clearly which stage is falling back and
        why.
     3. If Manager itself cannot perform (e.g., an external tool is
        required that the Manager lacks access to), escalate to
        needs-human per the standard escalate contract.
   - **Verify fallback is the same shape.** When no verify agent is
     defined and the Manager runs verify, it means: cd into the
     worktree, run `npm test`, `npm run typecheck`, `npm run build`
     in fail-fast order, write review.md at `$REVIEW_MD_PATH` with
     `verdict: pass` if all three pass, `verdict: needs-rework` with
     the failure output otherwise. Sequential across changes.
   - **Review fallback is the same shape.** When the review agent is
     unavailable, the Manager reads the diff (`git diff main...HEAD`
     in the worktree), assesses against the change's spec/proposal,
     and writes review.md with a verdict. Sequential across changes.
     Note that Manager review lacks the independence-of-perspective
     value of an external reviewer — for high-stakes changes,
     escalate rather than self-review is often better; project
     policy decides.

2. **Resolve the prompt for the receiving Agent CLI**:
   `entry.prompts[S]` wins byte-for-byte when explicitly set. Otherwise start
   from the established slash-command default:

   <!-- codex-preserve-start -->
   - `code`   → `/opsx:apply <change-id>`
   - `review` → `/ithy-opsx:review <change-id>`
   - `verify` → `/ithy-opsx:verify <change-id>`

   Codex is the sole exception because it does not accept the leading-slash
   skill form. Only when `entry.command == codex`, rewrite the selected default:

   - `/opsx:apply` → `openspec-apply`
   - `/ithy-opsx:review` → `ithy-opsx-review`
   - `/ithy-opsx:verify` → `ithy-opsx-verify`
   <!-- codex-preserve-end -->

   Use this same resolved string for direct subprocess delivery and the agmsg
   `--boot-prompt`; never choose it from the Manager's own CLI.

   Then substitute template vars: `${change_id}` → the current change id.

   **Worker MUST NOT commit.** The dispatched code worker's role is
   apply-only. The auto-committing `/ithy-opsx:apply` variant is
   NOT supported as a code worker prompt — its interactive "commit
   OK?" confirmation cannot be answered from an agmsg pane and
   the stage hangs to the ceiling. If `entry.prompts.code` starts
   with `/ithy-opsx:apply`, warn once and continue anyway (the
   Manager-commit contract below will still work in the "worker
   already committed" no-op case), but the recommended prompt is
   `/opsx:apply ${change_id}`.

3. **Dispatch**. Branch priority (first match wins):

   **Boundary post — before the spawn** (any branch):

   ```bash
   postManagerActivity "{\"changeId\":\"<change-id>\",\"stage\":\"$S\",\"activity\":\"dispatching\"}"
   ```

   **Boundary post — immediately after the spawn returns**, before
   entering the poll loop / awaiting the subagent:

   ```bash
   postManagerActivity "{\"changeId\":\"<change-id>\",\"stage\":\"$S\",\"activity\":\"waiting\",\"detail\":\"$entry_name\"}"
   ```

   For the Task-tool branch the "spawn returns" moment is when the
   Task call is issued (the subagent then runs to completion); for
   the subprocess branch it is the moment the child process starts.

   Manager (`roles` includes `manager`) is never dispatched through
   these branches — the Manager IS the dispatcher and runs in tmux
   pane 0 (or the direct-spawn PTY when agmsg is not configured).
   These branches only fire for worker roles.

   - **agmsg branch** — `entry.mode == "live-shell"` AND `agents.yaml`
     contains a valid `agmsg:` block (top-level `agmsg.team` set):

     ```bash
     # First: presence check for local agmsg install.
     if [ ! -f "$HOME/.agents/skills/agmsg/scripts/send.sh" ]; then
       echo "[dispatch] agmsg configured but not installed locally; falling back to non-agmsg dispatch"
       # Fall through to the Task tool / subprocess branches below.
     else
       case "$entry_command" in
         claude)      AGMSG_TYPE=claude-code ;;
         codex)       AGMSG_TYPE=codex ;;
         copilot)     AGMSG_TYPE=copilot ;;
         gemini)      AGMSG_TYPE=gemini ;;
         antigravity) AGMSG_TYPE=antigravity ;;
         opencode)    AGMSG_TYPE=opencode ;;
         cursor)      AGMSG_TYPE=cursor ;;
         *)           AGMSG_TYPE="" ;;
       esac
       if [ -z "$AGMSG_TYPE" ]; then
         /ithy-opsx:escalate <change-id> "agmsg-type unknown for command: $entry_command"
         exit
       fi
       # Extract --model <id> from entry.args and thread it to spawn.
       # agmsg spawn supports --model as pass-through (spawn.sh line 48).
       # Order-agnostic: the pair can appear anywhere in args.
       # Bare --model (missing, empty, or another --flag as next token) →
       # escalate rather than guess.
       MODEL_ARG=""
       n=${#entry_args[@]}
       for ((i=0; i<n; i++)); do
         if [ "${entry_args[$i]}" = "--model" ]; then
           j=$((i+1))
           next="${entry_args[$j]:-}"
           if [ $j -ge $n ] || [ -z "$next" ] || [[ "$next" == --* ]]; then
             /ithy-opsx:escalate <change-id> "agents.yaml agent \"$entry_name\" has bare --model without a value in args"
             exit
           fi
           MODEL_ARG="--model $next"
           break
         fi
       done
       # Slash command form (inside the Manager's Claude session).
       # This creates a new tmux pane running the worker CLI in
       # agmsg monitor mode, then injects the boot prompt.
       # $MODEL_ARG is empty when entry.args has no --model; a full
       # `--model <id>` pair when it does. Word-splitting is intentional.
       #
       # Report contract appended so the worker signals completion
       # explicitly (signal-stage-completion-via-agmsg-message).
       # <team> extracted from agents.yaml agmsg.team; <S> is the
       # current stage (code|review|verify).
       AGMSG_TEAM=$(awk '
         /^agmsg:/ { in_block=1; next }
         in_block && /^[^ ]/ { in_block=0 }
         in_block && /^  team:/ { sub(/^  team:[[:space:]]*/, ""); print; exit }
       ' agents.yaml)
       # Artifact contract — only review/verify stages write review.md.
       # Names the absolute path so the worker does not depend on its
       # own cwd inference (write-review-md-to-explicit-path).
       ARTIFACT_CONTRACT=""
       if [ "$S" = "review" ] || [ "$S" = "verify" ]; then
         ARTIFACT_CONTRACT="

--- artifact contract ---
Write your review.md to this exact absolute path:
  $REVIEW_MD_PATH
Do NOT rely on your CLI's cwd inference; the dispatcher will look
at this exact path only. If the path's parent directory does not
exist, create it first.
"
       fi
       REPORT_CONTRACT="

--- report contract ---
When your task completes (whether the outcome is pass, needs-rework,
or a blocker), send exactly ONE message to Manager via:
  ~/.agents/skills/agmsg/scripts/send.sh $AGMSG_TEAM $entry_name manager \\
    'stage:$S status:done change:<change-id>'
This tells Manager to inspect the review.md artifact (or git log
for code stage) and advance the workflow. Send exactly once.

The 'change:<change-id>' suffix disambiguates messages when
Manager is orchestrating multiple in-flight changes concurrently
(via /ithy-opsx:dispatch-multi, landed by
add-multi-dispatch-orchestrator). Single-dispatch invocations
also emit it for consistency; the Manager parser accepts both
the extended shape and the legacy 'stage:\$S status:done' shape
without change:<id>.
"
       # Manager registration guard (harden-dispatch-from-round3).
       # Before every spawn, ensure Manager is registered in the
       # team. join.sh is idempotent — safe to invoke unconditionally.
       # This closes the gap where prior cleanup operations dropped
       # Manager's registration silently, breaking the worker's
       # report send.sh with "manager is not registered in team".
       if ! ~/.agents/skills/agmsg/scripts/team.sh "$AGMSG_TEAM" 2>/dev/null | grep -qE '^\s*manager\s'; then
         ~/.agents/skills/agmsg/scripts/join.sh "$AGMSG_TEAM" manager claude-code "$(pwd)"
       fi
       # Order: artifact contract (worker writes review.md) then
       # report contract (worker signals done). A well-behaved worker
       # writes review.md before sending the message.
       /agmsg spawn "$AGMSG_TYPE" "$entry_name" $MODEL_ARG --boot-prompt "<resolved-prompt>$ARTIFACT_CONTRACT$REPORT_CONTRACT"
     fi
     ```

     Non-`--model` args in `entry.args` (e.g.
     `--dangerously-skip-permissions`) are NOT threaded on the CLI
     here — they are handled server-side by
     `auto-sync-agmsg-spawn-options`, which writes them into
     `~/.agmsg/config/spawn_options.yaml` so `spawn.sh` picks them
     up at spawn time. This skill only touches the CLI-level
     `--model` pass-through.

     Success judgment for this branch is **message-based** (see the
     agmsg branch of the 3-stage success contract below) — the
     spawn call returns as soon as the peer is listening; Manager
     then waits for the worker's `stage:$S status:done` message
     rather than polling files.

   Determine the launch strategy by comparing canonical CLI identities:

   ```
   MANAGER_CLI = canonical form of this Manager's executable
                 ("agy" and "antigravity" are the same identity)
   WORKER_CLI  = canonical form of entry.command
   STRATEGY:
     if entry.mode == "live-shell" AND agmsg configured → agmsg (already handled above)
     elif MANAGER_CLI == WORKER_CLI AND native adapter available for MANAGER_CLI → native
     else → subprocess (via server AgentRunner)
   ```

   - **Native-delegation branch** — Manager and worker share the same
     canonical CLI identity AND the Manager rendering exposes a native
     child Agent/Tool (currently: `claude` only; Codex and Agy fall
     through to the subprocess branch):

     **Claude Manager** — use the Task/Agent tool with the resolved
     role prompt and artifact contract:

     ```bash
     ARTIFACT_CONTRACT=""
     if [ "$S" = "review" ] || [ "$S" = "verify" ]; then
       ARTIFACT_CONTRACT="

--- artifact contract ---
Write your review.md to this exact absolute path:
  $REVIEW_MD_PATH
Do NOT rely on your CLI's cwd inference; the dispatcher will look
at this exact path only. If the path's parent directory does not
exist, create it first.
"
     fi
     FULL_PROMPT="<resolved-prompt>$ARTIFACT_CONTRACT"
     ```

     Then invoke the Task tool (or Agent tool) with `FULL_PROMPT` as
     the prompt and the worktree path (or project root for main-tree
     execution) as the working directory. The subagent runs in-process
     and returns when the slash command completes.

     **Codex Manager** — Codex has no native sub-agent tool in its
     current stable surface. Fall through to the subprocess branch for
     all Codex-to-Codex dispatches. The routing matrix condition
     `native adapter available for MANAGER_CLI` evaluates to false for
     Codex.

   - **Subprocess branch** — cross-CLI workers (e.g. Codex Manager +
     Agy worker), same-CLI workers without a native adapter (e.g. Agy
     Manager + Agy worker — Agy 1.1.10 has no child-agent API), or any
     CLI not in the native-adapter registry:

     The server registry owns all prompt-flag (`-p` / `exec`) and argv
     construction automatically.

     ```bash
     ARTIFACT_CONTRACT=""
     if [ "$S" = "review" ] || [ "$S" = "verify" ]; then
       ARTIFACT_CONTRACT="

--- artifact contract ---
Write your review.md to this exact absolute path:
  $REVIEW_MD_PATH
Do NOT rely on your CLI's cwd inference; the dispatcher will look
at this exact path only. If the path's parent directory does not
exist, create it first.
"
     fi
     cd .worktrees/<change-id>   # only when worktree mode
     <entry.command> <entry.args...> "<resolved-prompt>$ARTIFACT_CONTRACT"
     ```

     `entry.args` from `agents.yaml` carries CLI flags. Prompt flags
     (`-p` for non-Codex, `exec` for Codex) are automatically derived by
     the server registry.

4. **Judge success**:

   **Boundary post — the worker's result is in hand and Manager
   starts inspecting it** (report message received, subprocess
   exited, or Task-tool subagent returned):

   ```bash
   postManagerActivity "{\"changeId\":\"<change-id>\",\"stage\":\"$S\",\"activity\":\"judging\"}"
   ```

   - **`S = code`**: no artifact contract for Task tool / subprocess
     branches. Success = subprocess exit 0 / Task-tool subagent
     returned; failure = non-zero exit / tool failure → escalate
     `code stage subprocess failed with exit code <n>`. For the
     agmsg branch, use the polling contract below.
   - **`S = review` or `S = verify`**: apply the **3-stage success
     contract** below.

## 3-stage success contract (review / verify only)

Never trust exit code alone — Copilot and Antigravity return exit code
0 even on semantic failure. Judgment order for the Task tool /
subprocess branches:

1. **Subprocess non-zero exit** (or Task-tool subagent reported
   failure) → subprocess failure → escalate with `<stage> subprocess
   failed with exit code <N>`.
2. **Subprocess exit 0 but `$REVIEW_MD_PATH` is absent or its
   frontmatter unparseable** → contract failure → escalate with
   `<stage> returned no artifact`. The check uses the absolute
   path computed in step 4, not the relative form; see the
   artifact contract discussion above.
3. **`review.md` present with parseable `verdict:` frontmatter** →
   route on `pass` / `needs-rework`.

### agmsg branch — message-based judgment

`/agmsg spawn --boot-prompt` returns as soon as the peer is listening;
the boot task keeps running in the worker's tmux pane. The dispatcher
does NOT poll files. Instead, it waits for the worker's
`stage:$S status:done` message (appended to every agmsg-branch
boot-prompt as a report contract, see the spawn snippet above).

Wait mechanism (bash — Manager reads inbox at 5-second intervals via
`inbox.sh`, which marks matched messages as read so duplicates are
naturally suppressed by the DB state, not by client-side bookkeeping):

```bash
POLL_INTERVAL=5
CEILING_CODE=900     # 15 min
CEILING_REVIEW=300   # 5 min
ELAPSED=0
CEILING=$CEILING_REVIEW   # or $CEILING_CODE for code stage
PRE_HEAD=$(git rev-parse agent/<change-id> 2>/dev/null || echo "")
RECEIVED=0
# inbox.sh output shape (verified 2026-07-18):
#   `  [<iso-ts>] <sender>: <body>`
# One unread message per line; messages are marked-as-read on the
# call, so duplicates naturally suppress on the next iteration.
# We match on the sender being $entry_name and the body carrying the
# report contract token for this stage.
while [ $ELAPSED -lt $CEILING ]; do
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
  # Accept both the extended shape (with 'change:<id>' suffix, emitted
  # by workers spawned via add-multi-dispatch-orchestrator's updated
  # report contract) AND the legacy shape (bare 'stage:$S status:done').
  # For single-dispatch, either matches — there is only one in-flight
  # change per entry.
  if ~/.agents/skills/agmsg/scripts/inbox.sh "$AGMSG_TEAM" manager 2>/dev/null | \
       grep -qE "\] $entry_name: .*stage:$S status:done"; then
    RECEIVED=1
    break
  fi
done
if [ $RECEIVED -eq 0 ]; then
  /ithy-opsx:escalate <change-id> "<stage> agmsg worker did not report within timeout"
  exit
fi
```

After receipt, judge per stage:

- **`S = code`** — Manager owns the commit. Check the worktree
  status first, then decide.

  ```bash
  DIRTY=$(git -C .worktrees/<change-id> status --porcelain)
  HEAD_NOW=$(git rev-parse agent/<change-id> 2>/dev/null || echo "")
  ```

  - `$DIRTY` non-empty → Manager commits unconditionally, then
    advances:
    ```bash
    git -C .worktrees/<change-id> add .
    git -C .worktrees/<change-id> commit -m "impl: <change-id>"
    ```
    Phase advances to `coded`.
  - `$DIRTY` empty AND `$HEAD_NOW != $PRE_HEAD` → the worker
    self-committed (e.g. via a non-default apply variant).
    Manager's commit step is a no-op — no duplicate commit.
    Phase advances to `coded`.
  - `$DIRTY` empty AND `$HEAD_NOW == $PRE_HEAD` → escalate
    `code stage reported done but produced no changes`.

- **`S = review` or `S = verify`** — read `$REVIEW_MD_PATH`
  (the same absolute path the boot-prompt's artifact contract
  named). This is:
  - `<repo>/.worktrees/<change-id>/openspec/changes/<change-id>/review.md`
    in worktree mode
  - `<repo>/openspec/changes/<change-id>/review.md` in main-tree mode

  - Present with parseable `verdict:` frontmatter → route on
    `pass` / `needs-rework` per the standard contract.
  - Absent → retry once after `sleep 1` (race protection: worker
    may have sent the message just before its file write flushed).
  - Still absent after retry → escalate `<stage> reported done but
    did not write review.md at $REVIEW_MD_PATH`.

Duplicate messages from the same worker within the same stage
SHALL be ignored — Manager processes only the first matching
message per `(stage, entry.name)` pair.

## Failure recovery ladder

When a stage fails or the dispatch ends (whether successfully, via
escalation, or via a hung worker), clean up worker panes and team
memberships using the following ordered ladder. Each step is tried
in order; on failure, fall through to the next step; escalate with
a message naming the leaked resource only after step 3 fails.

Publish the cleanup boundary before entering the ladder, naming the
step being attempted (cleanup is the slowest invisible window —
10 s to 2 min — so the badge earns its keep here):

```bash
postManagerActivity "{\"changeId\":\"<change-id>\",\"stage\":\"$S\",\"activity\":\"cleanup\",\"detail\":\"despawn\"}"
```

Re-post with `"detail":"leave+kill-pane"` if the ladder falls through
to step 2, and with `"detail":"worktree-remove"` for any worktree
teardown done outside the ladder.

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
   <pane-id>, leaked team member <entry.name>` so the operator
   can inspect manually. Do NOT silently fall through to a bare
   `reset.sh` as a "just make it go away" catch-all.

## Steps

1. **Read change context**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md`, `tasks.md`, `specs/**/*.md`, `.openspec.yaml`
   - Optional: `review.md`, `needs-human.md`

   Summarize the intent in 2 sentences before proceeding.

2. **Check current phase**

   ```bash
   curl -sS $ITHYNO_BASE/api/changes/<change-id>/phase
   ```

   Parse the response's `phase` field:
   - `done` → exit: `Change already at phase: done — nothing to do.`
   - `needs-human` → exit: `Change is in needs-human — user must
     answer via /ithy-opsx:answer <id> "<answer>" before dispatcher can
     proceed.`
   - `proposed` or `null` — enter loop from step 6 (code first)
   - `coded` — enter loop from step 7 (review first)
   - `reviewed` — skip to step 8 (verify)
   - unknown value → escalate: `Unknown phase '<value>'.`

3. **Resolve execution mode (worktree vs main tree)**

   ```bash
   # parallelExecution flag (default false when absent).
   PARALLEL=$(sed -n 's/^parallelExecution:[[:space:]]*//p' agents.yaml 2>/dev/null | head -1)

   # proposal.md frontmatter `execution:` override (if present).
   OVERRIDE=$(sed -n '/^---$/,/^---$/p' "openspec/changes/<change-id>/proposal.md" 2>/dev/null | \
              sed -n 's/^execution:[[:space:]]*//p' | head -1)
   ```

   Priority: per-change `OVERRIDE` > `PARALLEL` config > default `false`.

   - `OVERRIDE == "worktree"` OR (`OVERRIDE` empty AND `PARALLEL == "true"`)
     → **worktree mode**.
   - Otherwise → **main-tree mode**.

   Announce which mode you entered: `Running in .worktrees/<id>` or
   `Running in main tree`.

4. **Set up worktree if worktree mode** (idempotent)

   **First, when `parallelExecution === false`, acquire the
   `.worktrees/.lock` semaphore.** The lock prevents starting a
   second change while a first is still active (per
   `collapse-jobregistry-and-add-semaphore`). Skip this whole
   sub-step when `parallelExecution === true` (multi-worktree
   mode).

   ```bash
   if [ "$PARALLEL" = "false" ] && [ -f .worktrees/.lock ]; then
     HELD=$(sed -n 's/^change:[[:space:]]*//p' .worktrees/.lock | head -1)
     if [ -n "$HELD" ] && [ -d ".worktrees/$HELD" ]; then
       # Lock held by another live change → escalate.
       if [ "$HELD" != "<change-id>" ]; then
         /ithy-opsx:escalate <change-id> "Another change ($HELD) is currently running. Merge or discard it before starting another."
         exit
       fi
       # Lock held by this same change → we're re-entering (attach path).
     else
       # Stale lock (held-change worktree missing) → delete and continue.
       rm -f .worktrees/.lock
     fi
   fi

   # Ensure .worktrees/ dir exists so the lock file can be written.
   mkdir -p .worktrees
   if [ "$PARALLEL" = "false" ] && [ ! -f .worktrees/.lock ]; then
     cat > .worktrees/.lock <<EOF
   change: <change-id>
   acquiredAt: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
   pid: null
   EOF
   fi
   ```

   **Then create the worktree** (idempotent):

   ```bash
   if [ ! -d ".worktrees/<change-id>" ]; then
     git worktree add -b agent/<change-id> .worktrees/<change-id> HEAD
   fi
   ```

   `git worktree add` fails when the branch or dir already exists —
   the `if` guard makes the step **idempotent** across re-runs.

   All subsequent worker invocations reference `.worktrees/<change-id>`
   as the subprocess cwd. Manager Task-tool subagents inherit the
   current session's cwd (project root), so they need to `cd` inside
   the prompt or rely on `/ithy-opsx:apply` which cds itself.

   **Compute `TARGET_PATH`** (absolute path where review.md lands,
   per `write-review-md-to-explicit-path`). Both the boot-prompt's
   artifact contract and Manager's post-report artifact read
   resolve against this:

   ```bash
   if [ -d ".worktrees/<change-id>" ]; then
     TARGET_PATH="$(pwd)/.worktrees/<change-id>"
   else
     TARGET_PATH="$(pwd)"
   fi
   REVIEW_MD_PATH="$TARGET_PATH/openspec/changes/<change-id>/review.md"
   ```

5. **Manager registration guard** (agmsg configured only)

   Before any worker spawn, ensure Manager is registered in the
   agmsg team. Prior cleanup operations (bad `reset.sh` calls,
   worktree churn, external `leave.sh`) can silently drop
   Manager's team membership; when that happens, the worker's
   `send.sh` for the report contract fails with `manager is not
   registered in team <team>` and dispatch stalls waiting for a
   message that will never come.

   `join.sh` is idempotent — safe to re-invoke when already
   registered. Only enter this step when `agents.yaml` has a
   valid `agmsg:` block (no-op otherwise):

   ```bash
   AGMSG_TEAM=$(awk '
     /^agmsg:/ { in_block=1; next }
     in_block && /^[^ ]/ { in_block=0 }
     in_block && /^  team:/ { sub(/^  team:[[:space:]]*/, ""); print; exit }
   ' agents.yaml)
   if [ -n "$AGMSG_TEAM" ] && [ -f "$HOME/.agents/skills/agmsg/scripts/join.sh" ]; then
     ~/.agents/skills/agmsg/scripts/join.sh "$AGMSG_TEAM" manager claude-code "$(pwd)"
   fi
   ```

   Additionally, the Dispatch helper protocol re-verifies Manager
   membership before each `/agmsg spawn` (see the guard inside
   the agmsg branch). This step defends the initial dispatch
   entry; the per-spawn guard defends cross-stage drift.

6. **LOOP — code stage** (skip when phase is already `coded` or later)

   Increment iteration counter:

   ```
   iteration += 1
   if iteration > MAX_REWORK_ROUNDS:
     /ithy-opsx:escalate <change-id> "Dispatch loop did not converge after MAX_REWORK_ROUNDS iterations. Latest review findings: <priorFindings>"
     exit
   ```

   Dispatch the code worker via the **Dispatch helper protocol** with
   stage `S = code`. Append `priorFindings` (if non-empty) to the
   resolved prompt so the worker sees the review's feedback:

   ```
   final_prompt = resolved_code_prompt + "\n" + priorFindings
   ```

   On success (agmsg branch: message received; Task/subprocess
   branch: exit 0):

   - Apply the code-stage judgment from the 3-stage success
     contract's agmsg branch above: Manager commits any
     uncommitted worker output on `agent/<change-id>`
     unconditionally (`impl: <change-id>`). If the tree is clean
     AND no new commit exists beyond `$PRE_HEAD`, escalate
     instead of advancing.
   - Advance phase:
     ```bash
     postManagerActivity "{\"changeId\":\"<change-id>\",\"stage\":\"code\",\"activity\":\"transitioning\"}"
     curl -sS -X POST "$ITHYNO_BASE/api/changes/<change-id>/phase" \
       -H 'content-type: application/json' \
       -H "X-Session-Token: $ITHYNO_SESSION_TOKEN" \
       -d '{"phase": "coded"}'
     ```
     Log: `[dispatch] iteration <n>: code done, phase=coded`.

7. **LOOP — review stage**

   Dispatch the review worker via the **Dispatch helper protocol**
   with stage `S = review`. Apply the **3-stage success contract**.

   Read the review artifact and parse frontmatter's `verdict`.
   Use the absolute `$REVIEW_MD_PATH` computed in step 4 — the
   same path the worker's artifact contract instructed. The older
   relative form is not compliant in worktree mode because
   Manager's cwd (project root) is not the worktree.

   ```bash
   cat "$REVIEW_MD_PATH"
   ```

   - `verdict: pass`:
     ```bash
     postManagerActivity "{\"changeId\":\"<change-id>\",\"stage\":\"review\",\"activity\":\"transitioning\"}"
     curl -sS -X POST "$ITHYNO_BASE/api/changes/<change-id>/phase" \
       -H 'content-type: application/json' \
       -H "X-Session-Token: $ITHYNO_SESSION_TOKEN" \
       -d '{"phase": "reviewed"}'
     ```
     Log: `[dispatch] iteration <n>: review pass, phase=reviewed`.
     Break out of the loop, proceed to step 8.

   - `verdict: needs-rework`:
     Format findings as prompt suffix for the next code iteration:
     ```
     priorFindings = "Prior review findings to address:\n" +
                     findings.map(f =>
                       `- ${f.severity} ${f.file || ""}:${f.line || ""} — ${f.message}`
                     ).join("\n")
     ```
     Log: `[dispatch] iteration <n>: review needs-rework (<count> findings), retrying code`.
     Continue loop (back to step 6).

8. **Verify stage**

   Dispatch the verify worker via the **Dispatch helper protocol** with
   stage `S = verify`. Apply the **3-stage success contract**.

   Read the updated `$REVIEW_MD_PATH` and parse `verdict`
   (absolute path, matches the artifact contract):

   ```bash
   cat "$REVIEW_MD_PATH"
   ```

   - `verdict: pass`:
     ```bash
     postManagerActivity "{\"changeId\":\"<change-id>\",\"stage\":\"verify\",\"activity\":\"transitioning\"}"
     curl -sS -X POST "$ITHYNO_BASE/api/changes/<change-id>/phase" \
       -H 'content-type: application/json' \
       -H "X-Session-Token: $ITHYNO_SESSION_TOKEN" \
       -d '{"phase": "done"}'

     # Release the .worktrees/.lock semaphore (parallelExecution=false only).
     if [ "$PARALLEL" = "false" ] && [ -f .worktrees/.lock ]; then
       HELD=$(sed -n 's/^change:[[:space:]]*//p' .worktrees/.lock | head -1)
       if [ "$HELD" = "<change-id>" ]; then
         rm -f .worktrees/.lock
       fi
     fi

     # Final boundary — clears the Manager badge for this change.
     postManagerActivity "{\"changeId\":\"<change-id>\",\"activity\":\"idle\"}"
     ```
     Report:
     ```
     Dispatch complete for <change-id>.
     Phase: done. <n> code/review iterations.
     Ready for /ithy-opsx:archive.
     ```
     Exit.

   - `verdict: needs-rework`:
     Escalate: `Verify failed: <summary>` (include findings so the
     user sees which command failed); exit.

## Guardrails

- **Convergence guard**: MAX_REWORK_ROUNDS is a hard ceiling. Do NOT
  bypass it. If a change is stuck at needs-rework after MAX_REWORK_ROUNDS
  iterations (default 5, configurable via `agents.yaml.maxReworkRounds`),
  human input is required.

- **One phase update per stage**: only call `POST /api/changes/:id/phase`
  after the corresponding worker returned success AND the review /
  verify verdict is `pass`. Do NOT set `phase: needs-human` from the
  dispatcher — that's `/ithy-opsx:escalate`'s job.

- **Do NOT modify code from the dispatcher session**. All code changes
  happen inside dispatched worker invocations (Task tool subagent OR
  subprocess CLI). If the dispatcher needs to investigate, use
  Read-only tools.

- **Never trust subprocess exit code alone for review/verify**.
  Copilot and Antigravity both return exit 0 even on semantic failure.
  Use the 3-stage success contract — the `review.md` file is the
  contract, not stdout.

- **`args` must include CLI-specific permission-skip flags**. The
  dispatcher does not synthesize `--yolo`,
  `--dangerously-skip-permissions`, etc. — they belong in
  `agents.yaml`'s `args` array.

- **Do NOT retry a failed worker without changing input**. If a code
  dispatch returned failure on the same `priorFindings` twice in a
  row, escalate.

- **Do NOT skip the phase check in step 2**. Re-entering the dispatcher
  on a change that's `done` or `needs-human` MUST be a no-op.

- **Escalation is dispatcher's last resort, not first**. Only escalate
  when the loop cannot make progress: worker failure, missing artifact,
  or convergence cap. A single `needs-rework` verdict is NOT an
  escalation trigger.

- **Restart recovery**: when the dispatcher is invoked a second time on
  the same change (e.g., because the PTY session died), the phase
  check in step 2 does the right thing automatically. A change at
  `coded` skips to review; at `reviewed` skips to verify.

- **Semaphore release on every exit path** (`parallelExecution=false`
  only). Before invoking `/ithy-opsx:escalate` from ANY stage — code stage
  failure, review contract failure, verify failure, MAX_ITERATIONS
  cap — release the lock if this dispatcher holds it:

  ```bash
  if [ "$PARALLEL" = "false" ] && [ -f .worktrees/.lock ]; then
    HELD=$(sed -n 's/^change:[[:space:]]*//p' .worktrees/.lock | head -1)
    if [ "$HELD" = "<change-id>" ]; then
      rm -f .worktrees/.lock
    fi
  fi
  ```

  Do NOT delete the lock when it's held by a different change (that
  would be a bug — you'd release someone else's lock).

- **Manager-activity clear on every exit path**. Every path that
  returns control to the user — verify pass, `/ithy-opsx:escalate`
  from any stage, worker timeout, the phase-check no-op in step 2 —
  MUST end with:

  ```bash
  postManagerActivity "{\"changeId\":\"<change-id>\",\"activity\":\"idle\"}"
  ```

  A stale `waiting` badge on a dispatch that already exited is worse
  than no badge: it tells the user work is in flight when nothing is.
  The post is best-effort (no token → no-op) and never blocks the
  exit.

## Follow-ups (not this file)

- Per-role `maxReworkRounds` override (e.g., `agents[].maxReworkRounds`
  overriding the top-level default). Deferred — the top-level field
  landed by `add-agents-max-rework-rounds-config` covers the common case.
- Per-project verify command
  (`docs/ideas/2026-07-11-verify-command-per-project.md`).
- Explicit `agmsgType` field on `agents.yaml` agent entries when the
  command-name → agmsg-type inference table proves insufficient
  (non-canonical wrapper commands). Deferred until a real user needs
  it — landed as a note in
  `openspec/changes/archive/2026-07-17-route-live-shell-to-agmsg-spawn/outcome.md`.
- Stale-pane cleanup: `/agmsg spawn` creates a fresh pane per
  invocation. A `kill-pane on task done` hook (via `agmsg cleanup`
  or `tmux kill-pane`) is a follow-up.
- Polling ceilings (15 min code / 5 min review-verify) are hand-
  picked; tune once real workloads land.
