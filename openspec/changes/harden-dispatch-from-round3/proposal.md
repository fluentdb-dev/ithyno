---
tags: [feature/agents, feature/messaging, area/skills, agmsg, dispatch]
---

# Harden dispatch from Round 3 verify findings

## Why

Round 3 (`verify-dispatch-e2e-3`) exposed three workflow bugs that
survived the earlier `signal-stage-completion-via-agmsg-message`,
`write-review-md-to-explicit-path`, and
`clarify-agmsg-dispatch-semantics` fixes. Each of these bugs is a
**workflow contract gap**, not an operator misstep — the skill
should not require the Manager to reason about cleanup hygiene or
guess which cleanup script is safe.

1. **Worker gets stuck at Claude Code's interactive "commit OK?"
   prompt.** The default code worker prompt in `agents.yaml`
   (`/ithy-opsx:apply ${change_id}`) implements
   apply-plus-auto-commit. The commit step opens an interactive
   confirmation prompt that `--dangerously-skip-permissions` does
   NOT suppress. An agmsg-routed worker cannot answer this prompt
   (no user in the pane), so the code stage hangs until the
   15-min ceiling and Manager escalates. Reproduced in Round 1
   and again in Round 3.

2. **Manager's team registration disappears mid-dispatch.**
   Somewhere in the dispatch → spawn → cleanup lifecycle,
   `manager` gets dropped from `agmsg` team members, and the next
   worker's report `send.sh` fails with
   `manager is not registered in team openspec-ui`. Root cause
   traces back to the skill not defending Manager's registration
   at each stage boundary. Once dropped, the workflow silently
   breaks.

3. **No defined failure-recovery ladder.** When a stage fails or
   the worker's tmux pane can't be despawned (e.g. because
   `spawn.sh` didn't record a placement — see the
   `run/spawn.<team>__<name>` first-run mkdir gap), the skill
   doesn't say what to do. Manager (or the operator resuming)
   improvises, reaches for `reset.sh`, and — because `reset.sh`
   without an `agent_id` argument clears the entire
   `(project, type)` slice — collateral damage takes down
   unrelated registrations including Manager's. This is bug #2's
   proximate cause and the reason we cannot blame the operator.

The common thread is **error-recovery paths and cross-stage
invariants that live outside the skill's normative text**. This
change moves them inside.

## What Changes

### 1. `Dispatch Slash Command` — Manager owns the commit

Worker `stage:code status:done` message SHALL be treated as an
apply-only signal. Manager unconditionally commits the worker's
uncommitted output on `agent/<change-id>` before advancing to
`coded`.

Consequences:

- The old `git log agent/<change-id>` head comparison (used to
  detect worker-side commits) is **removed** from the code-stage
  contract. Worker commits are out of scope for dispatched code
  stages.
- `agents.yaml` example / default code worker prompt SHALL be
  `/opsx:apply ${change_id}` (apply only). The self-committing
  `/ithy-opsx:apply` variant remains valid outside dispatch (user
  invocation from the terminal), but is not supported as a
  dispatched code worker.
- Escalation `code stage reported done but produced no changes`
  fires when the tree is clean AND no commit landed — same
  semantics as before, but the tree-check is now the sole
  criterion.

### 2. `Dispatch Slash Command` — Manager registration guard

At the start of each dispatch invocation (before any spawn), the
skill SHALL idempotently ensure Manager is registered in the
team via:

```bash
~/.agents/skills/agmsg/scripts/join.sh "$AGMSG_TEAM" manager \
  claude-code "$(pwd)"
```

`join.sh` is idempotent (safe to re-run when already registered).
This closes the gap where prior operations dropped Manager's
registration silently.

Additionally, before each stage's spawn, the skill SHALL verify
Manager is still in the team via `team.sh` and re-join if not.
The check is cheap and defends against any cross-stage drift.

### 3. `Dispatch Slash Command` — Failure recovery ladder

The skill SHALL specify a normative cleanup order for stage
failure and end-of-dispatch pane cleanup:

1. **Preferred**: `despawn.sh "$AGMSG_TEAM" manager "$entry_name"`
   (graceful teardown; releases pane placement + team member).
2. **On despawn failure** (e.g. missing placement record from
   `spawn.sh`'s known `run/` dir gap): `leave.sh "$AGMSG_TEAM"
   "$entry_name"` + `tmux kill-pane -t "$WORKER_PANE_ID"`.
   Specific agent, specific pane, no collateral.
3. **NEVER**: bare `reset.sh "$path" <type>` (missing `agent_id`
   arg). This clears every agent of that type under that project
   path — including Manager if Manager's project path shares a
   prefix or ancestor with the target. The skill SHALL NOT invoke
   `reset.sh` in any recovery path. Full-team resets are a manual
   operator escape hatch, not a skill responsibility.

If the pane truly must be force-killed (e.g. hung worker,
placement missing) and step 2 also fails, escalate with a message
naming the leaked pane / team member so the operator can inspect
manually. Do not silently fall through to `reset.sh`.

### 4. What this change does NOT touch

- **agmsg upstream (`fujibee/agmsg`)** — the `run/` dir mkdir gap
  and `reset.sh` scope semantics remain agmsg concerns. This
  skill defends against them without waiting for upstream fixes.
- **`/ithy-opsx:apply` skill body** — remains as-is for direct
  user invocation. Only its use as a dispatched code worker prompt
  is deprecated.
- **Copilot iteration model** — untouched (fresh-spawn per
  iteration continues per `clarify-agmsg-dispatch-semantics`).
- **Report / artifact contracts** — untouched (retain the current
  wording from `signal-stage-completion-via-agmsg-message` and
  `write-review-md-to-explicit-path`).

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Dispatch Slash Command` — Manager-owns-commit
  contract, Manager registration guard, Failure recovery ladder.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED
- **Affected code**:
  - `.claude/commands/ithy-opsx/dispatch.md` — insert Manager
    registration guard at dispatch start; add failure recovery
    ladder section; drop the "if a new commit landed" branch from
    code-stage judgment.
  - `agents.yaml` — change the default worker prompt for `claude`
    to `/opsx:apply ${change_id}` and update the `description`.
- **Risk**:
  - Users who intentionally configured `/ithy-opsx:apply` as their
    dispatched code worker (rare — the interactive prompt makes
    this unusable in agmsg mode) will see a behavior change:
    Manager now always commits, potentially producing a duplicate
    commit if the worker did commit. Mitigation: the "no commit
    landed AND tree clean" check turns into just "tree clean",
    so a worker that already committed leaves the tree clean and
    Manager's commit becomes a no-op (nothing to stage). No
    duplicate commits.
  - The Manager registration guard adds one `join.sh` call per
    dispatch. Cost: negligible (single sqlite write, no network).
- **Migration**: none. The behavior change is confined to the
  dispatch flow; `/ithy-opsx:apply` still works for direct user
  invocation.

## Related

- `verify-dispatch-e2e-3` (Round 3 verify session — bugs
  discovered here).
- `signal-stage-completion-via-agmsg-message` (message-based
  wait — landed).
- `write-review-md-to-explicit-path` (artifact contract absolute
  path — landed).
- `clarify-agmsg-dispatch-semantics` (Copilot iteration + mode
  docs — landed).
