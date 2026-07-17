---
name: "ITHY-OPSX: Dispatch"
description: Dispatch orchestrator — read agents.yaml, set up worktree, run code → review → verify chain per role/CLI mapping
category: Workflow
tags: [workflow, dispatch, orchestrator, ithy-opsx]
argument-hint: "<change-id>"
---

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
   (Task tool for `command == "claude"`, subprocess `-p` otherwise).
4. Judging review / verify by the **3-stage success contract**.
5. Looping code↔review until pass or MAX_ITERATIONS; escalating on
   non-convergence.

**Input**: `$ARGUMENTS` is the change id.

**Constants**:

- `MAX_ITERATIONS = 5` — the code ↔ review loop halts and escalates
  after this many attempts.
- `ITHYNO_BASE = http://localhost:4321` — adjust if the user's
  `ITHYNO_PORT` differs.

## Dispatch helper protocol (referenced by every stage)

For each stage `S ∈ {code, review, verify}`:

1. **Resolve the agent entry** from `agents.yaml`. Pick the first
   entry whose `roles` array includes `S`.

   ```bash
   # Rough shape (implement with sed/yq in Bash):
   entry = agents.yaml.agents.find(a => a.roles.includes(S))
   ```

   - **No entry found** for `S = code` → fall back to **Manager
     self-dispatch**: invoke the Task tool with the resolved prompt,
     letting Claude implement the change directly.
   - **No entry found** for `S = review` or `S = verify` → escalate
     with `no agent declared for role: <S>`.

2. **Resolve the prompt**: `entry.prompts[S]` if set, else the
   built-in default:
   - `code`   → `/opsx:apply <change-id>`
   - `review` → `/ithy-opsx:review <change-id>`
   - `verify` → `/ithy-opsx:verify <change-id>`

   Then substitute template vars: `${change_id}` → the current change id.

3. **Dispatch**. Branch priority (first match wins):

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
         /opsx:escalate <change-id> "agmsg-type unknown for command: $entry_command"
         exit
       fi
       # Slash command form (inside the Manager's Claude session).
       # This creates a new tmux pane running the worker CLI in
       # agmsg monitor mode, then injects the boot prompt.
       /agmsg spawn "$AGMSG_TYPE" "$entry_name" --boot-prompt "<resolved-prompt>"
     fi
     ```

     Success judgment for this branch is **poll-based** (see the
     agmsg branch of the 3-stage success contract below) — the
     spawn call returns as soon as the peer is listening, not when
     the boot task is done.

   - **Task tool branch** — `entry.command == "claude"` (Manager
     self-dispatch or `mode: single-prompt` claude workers):

     ```
     Task tool: prompt = <resolved-prompt>
     ```

     The subagent runs in-process and returns when the slash command
     completes.

   - **Subprocess branch** — anything else (copilot, agy, aider, or
     any CLI without a Task-tool integration):

     ```bash
     cd .worktrees/<change-id>   # only when worktree mode
     <entry.command> <entry.args...> -p "<resolved-prompt>"
     ```

     `entry.args` from `agents.yaml` MUST include the CLI's
     permission-skip flag (`--yolo` for Copilot,
     `--dangerously-skip-permissions` for Antigravity, etc.).

4. **Judge success**:

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
2. **Subprocess exit 0 but `openspec/changes/<change-id>/review.md`
   is absent or its frontmatter unparseable** → contract failure →
   escalate with `<stage> returned no artifact`.
3. **`review.md` present with parseable `verdict:` frontmatter** →
   route on `pass` / `needs-rework`.

### agmsg branch — poll-based judgment

`/agmsg spawn --boot-prompt` returns as soon as the peer is listening;
the boot task keeps running in the worker's tmux pane. The dispatcher
polls for the artifact:

- **`S = code`** — poll `git log agent/<change-id> -1 --format=%H` at
  a 5-second interval. When the head hash differs from the pre-spawn
  hash (a new commit landed), the code stage is done → advance phase
  to `coded`. **Ceiling: 15 minutes.** On timeout → escalate
  `code stage agmsg worker did not commit within timeout`.

- **`S = review` or `S = verify`** — poll for
  `openspec/changes/<change-id>/review.md` existence + parseable
  `verdict:` frontmatter at a 5-second interval. When both are
  satisfied, route on `pass` / `needs-rework` per the standard
  contract. **Ceiling: 5 minutes.** On timeout → escalate
  `<stage> agmsg worker did not produce review.md within timeout`.

Rough polling shape (bash):

```bash
POLL_INTERVAL=5
CEILING_CODE=900     # 15 min
CEILING_REVIEW=300   # 5 min
ELAPSED=0
CEILING=$CEILING_REVIEW   # or $CEILING_CODE for code stage
PRE_HEAD=$(git rev-parse agent/<change-id> 2>/dev/null || echo "")
while [ $ELAPSED -lt $CEILING ]; do
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
  # code stage:
  NEW_HEAD=$(git rev-parse agent/<change-id> 2>/dev/null || echo "")
  if [ "$NEW_HEAD" != "$PRE_HEAD" ] && [ -n "$NEW_HEAD" ]; then break; fi
  # OR review/verify stage:
  if [ -f "openspec/changes/<change-id>/review.md" ] && \
     grep -q "^verdict:" "openspec/changes/<change-id>/review.md"; then break; fi
done
if [ $ELAPSED -ge $CEILING ]; then
  /opsx:escalate <change-id> "<stage> agmsg worker did not produce review.md within timeout"
  exit
fi
```

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
     answer via /opsx:answer <id> "<answer>" before dispatcher can
     proceed.`
   - `proposed` or `null` — enter loop from step 5 (code first)
   - `coded` — enter loop from step 6 (review first)
   - `reviewed` — skip to step 7 (verify)
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
         /opsx:escalate <change-id> "Another change ($HELD) is currently running. Merge or discard it before starting another."
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

5. **LOOP — code stage** (skip when phase is already `coded` or later)

   Increment iteration counter:

   ```
   iteration += 1
   if iteration > MAX_ITERATIONS:
     /opsx:escalate <change-id> "Dispatch loop did not converge after MAX_ITERATIONS iterations. Latest review findings: <priorFindings>"
     exit
   ```

   Dispatch the code worker via the **Dispatch helper protocol** with
   stage `S = code`. Append `priorFindings` (if non-empty) to the
   resolved prompt so the worker sees the review's feedback:

   ```
   final_prompt = resolved_code_prompt + "\n" + priorFindings
   ```

   On success:

   - Commit the impl on `agent/<change-id>` if the worker did not
     already commit (some workers like `/ithy-opsx:apply` commit
     themselves; the plain `/opsx:apply` does not).
   - Advance phase:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "coded"}'
     ```
     Log: `[dispatch] iteration <n>: code done, phase=coded`.

6. **LOOP — review stage**

   Dispatch the review worker via the **Dispatch helper protocol**
   with stage `S = review`. Apply the **3-stage success contract**.

   Read the review artifact and parse frontmatter's `verdict`:

   ```bash
   cat openspec/changes/<change-id>/review.md
   ```

   - `verdict: pass`:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "reviewed"}'
     ```
     Log: `[dispatch] iteration <n>: review pass, phase=reviewed`.
     Break out of the loop, proceed to step 7.

   - `verdict: needs-rework`:
     Format findings as prompt suffix for the next code iteration:
     ```
     priorFindings = "Prior review findings to address:\n" +
                     findings.map(f =>
                       `- ${f.severity} ${f.file || ""}:${f.line || ""} — ${f.message}`
                     ).join("\n")
     ```
     Log: `[dispatch] iteration <n>: review needs-rework (<count> findings), retrying code`.
     Continue loop (back to step 5).

7. **Verify stage**

   Dispatch the verify worker via the **Dispatch helper protocol** with
   stage `S = verify`. Apply the **3-stage success contract**.

   Read the updated `review.md` and parse `verdict`:

   - `verdict: pass`:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "done"}'

     # Release the .worktrees/.lock semaphore (parallelExecution=false only).
     if [ "$PARALLEL" = "false" ] && [ -f .worktrees/.lock ]; then
       HELD=$(sed -n 's/^change:[[:space:]]*//p' .worktrees/.lock | head -1)
       if [ "$HELD" = "<change-id>" ]; then
         rm -f .worktrees/.lock
       fi
     fi
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

- **Convergence guard**: MAX_ITERATIONS is a hard ceiling. Do NOT
  bypass it. If a change is stuck at needs-rework after 5 iterations,
  human input is required.

- **One phase update per stage**: only call `POST /api/changes/:id/phase`
  after the corresponding worker returned success AND the review /
  verify verdict is `pass`. Do NOT set `phase: needs-human` from the
  dispatcher — that's `/opsx:escalate`'s job.

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
  only). Before invoking `/opsx:escalate` from ANY stage — code stage
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

## Follow-ups (not this file)

- Per-project `manager.maxIterations` field in `agents.yaml`
  (`docs/ideas/2026-07-11-manager-max-iterations-config.md`).
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
