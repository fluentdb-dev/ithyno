---
name: ithy-opsx-dispatch-multi
description: Parallel N-change dispatcher for ithyno. Fans out code / review / verify workers across multiple in-flight changes concurrently, with per-change queue + combined poll loop + `change:<id>` message routing. Invoked via `/ithy-opsx:dispatch-multi <id1> [id2] ...`. Landed by add-multi-dispatch-orchestrator.
---

# `/ithy-opsx:dispatch-multi <id1> [id2] …` — parallel dispatcher

This skill is the recipe Claude (Manager) runs when the user asks
to dispatch multiple changes at once. It reuses the per-stage
mechanics of `/ithy-opsx:dispatch` and adds:

- **Combined poll loop** over the Manager inbox for all in-flight
  changes.
- **`change:<id>` message routing** — the extended report contract
  disambiguates which change a `stage:$S status:done` message is
  for.
- **Concurrency cap** — `agents.yaml.maxParallel` bounds the
  active worker count; excess ids queue.
- **Per-change independence** — one change escalating does NOT
  stop the others.

Landed by `add-multi-dispatch-orchestrator`.

## When Claude runs this

- User types `/ithy-opsx:dispatch-multi <id1> [id2] ...` (the slash
  command entry lives at `.claude/commands/ithy-opsx/dispatch-multi.md`).
- User asks in natural language for parallel dispatch of >1 change.

## Constants

- `MAX_ITERATIONS = 5` — per-change code↔review cap (matches
  `/ithy-opsx:dispatch`).
- `POLL_INTERVAL = 5` — inbox poll cadence (seconds).
- `ITHYNO_BASE = http://localhost:4321` — phase API endpoint.

## What this skill DOES

- Preflight all input ids, escalate on the first unknown one.
- Setup per-change worktrees (idempotent).
- Fan-out code workers up to `maxParallel`.
- Route messages via `change:<id>` suffix to their owning entries.
- Advance each change through `coded → reviewed → done`
  independently.
- Loop back to code on `needs-rework`, capped by `MAX_ITERATIONS`
  per change.
- Report a per-id summary at exit.

## What this skill does NOT do

- No `git commit` beyond the standard Manager-commit contract
  (`impl: <change-id>` on the agent branch when the worker leaves
  a dirty tree).
- No `openspec archive` — that's `/ithy-opsx:archive` per change.
- No `parallelExecution: true` gate check — dispatch-multi assumes
  worktree mode is available; it uses it unconditionally.
- No cross-change coordination — each change advances on its own
  clock. A change that finishes first does NOT wait for others.

## Steps

### 1. Preflight

1. **Parse ids**. `$ARGUMENTS` is a whitespace-separated list.
   Trim, dedupe, preserve order. If empty, escalate with
   `dispatch-multi requires at least one change id`.
2. **Validate every id** by checking
   `openspec/changes/<id>/` exists (not the archive path). On the
   first unknown id, escalate with
   `unknown change id: <id>` and STOP — do not spawn any workers.
3. **Git identity**. Confirm `git config user.name` and `user.email`
   are set (needed for Manager-commit contract).
4. **agmsg configured?** Read `agents.yaml`. If the top-level
   `agmsg:` block is present, the flow uses agmsg branch spawns
   (non-blocking). If absent, fall back to sequential Task-tool
   dispatch per change — log a warning: `[dispatch-multi] agmsg
   not configured; degrading to sequential dispatch`.

### 2. Capacity resolution

1. Read `agents.yaml.maxParallel` (default `3`, range `[1, 10]`).
   Cap invalid values at the range bounds and log.
2. `ACTIVE = min(len(ids), maxParallel)`.
3. Split ids into `RUNNING` (first `ACTIVE`) and `QUEUE` (rest).

### 3. Per-change worktree setup

For each id in `RUNNING`, run the standard setup:

```bash
if [ ! -d ".worktrees/<id>" ]; then
  git worktree add -b agent/<id> .worktrees/<id> HEAD
fi
```

Each change gets its own worktree; they never share disk state.
Compute per-change `TARGET_PATH` + `REVIEW_MD_PATH` as
`/ithy-opsx:dispatch` does.

### 4. Manager registration guard (agmsg only)

```bash
AGMSG_TEAM=$(awk '/^agmsg:/{in=1;next} in && /^[^ ]/{in=0} in && /^  team:/{sub(/^  team:[[:space:]]*/,""); print; exit}' agents.yaml)
if [ -n "$AGMSG_TEAM" ] && [ -f "$HOME/.agents/skills/agmsg/scripts/join.sh" ]; then
  ~/.agents/skills/agmsg/scripts/join.sh "$AGMSG_TEAM" manager claude-code "$(pwd)"
fi
```

### 5. Fan-out code stage

For every id in `RUNNING`, dispatch the code worker via the
standard Dispatch helper protocol (agmsg / Task tool / subprocess)
per `/ithy-opsx:dispatch`'s step 3.

**Boot-prompt report contract**: extend the token to include
`change:<id>` so the Manager can route messages when multiple are
in flight:

```
stage:$S status:done change:<change-id>
```

For agmsg-branch spawns, replace the `send.sh` command in the
boot-prompt's `--- report contract ---` block with the extended
form. Task tool / subprocess branches don't send agmsg messages;
their success is judged by exit code / artifact presence per the
`/ithy-opsx:dispatch` 3-stage contract.

Record per-change tracking state:

```
state[id] = {
  entry_name,           # from agents.yaml code role
  phase: "code",
  iterations: 1,
  PRE_HEAD: <git rev-parse agent/<id>>,
  start_ts: <now>,
}
```

### 6. Combined poll loop

Single `while` loop until every id is `done` or `escalated`:

```bash
POLL_INTERVAL=5
LOOP_START=$(date +%s)
CEILING=1800   # 30 min hard cap on the whole invocation

while true; do
  ELAPSED=$(( $(date +%s) - LOOP_START ))
  if [ "$ELAPSED" -gt "$CEILING" ]; then
    # Escalate the still-in-flight changes; break.
    break
  fi
  sleep $POLL_INTERVAL

  # Read all unread messages once per tick.
  MESSAGES=$(~/.agents/skills/agmsg/scripts/inbox.sh "$AGMSG_TEAM" manager 2>/dev/null)

  # For each line matching `[<ts>] <sender>: stage:<S> status:done change:<id>`
  # OR the legacy `[<ts>] <sender>: stage:<S> status:done` (fall back to
  # the sole in-flight change for that sender):
  #   route to state[change_id] and advance.
  ...
done
```

**Message routing per line**:

1. Parse `sender`, `stage`, `change_id` (may be empty for legacy).
2. If `change_id` empty AND exactly one in-flight change uses this
   `sender` (i.e., this `entry_name`), route to that change.
3. If `change_id` empty AND multiple in-flight → warn `[dispatch-
   multi] ambiguous legacy report from <sender>; unable to route`
   and skip.
4. If `change_id` matches an in-flight state → advance per stage.
5. If `change_id` matches an already-terminal state → warn
   `[dispatch-multi] duplicate message for <change_id> (already
   <status>)` and skip.

**Per-stage advance** (same logic as single dispatch):

- **`stage: code`** — commit worker output if dirty (Manager-commit
  contract), advance phase to `coded`, spawn review worker for
  this change.
- **`stage: review`** with `verdict: pass` — advance to `reviewed`,
  spawn verify worker.
- **`stage: review`** with `verdict: needs-rework` — if
  `state[id].iterations < MAX_ITERATIONS`, increment and spawn a
  new code worker with prior findings; else mark `escalated`.
- **`stage: verify`** with `verdict: pass` — mark `done`. If
  `QUEUE` non-empty, pop next id and spawn its code stage; add to
  `state`.

### 7. Termination + report

Loop ends when every input id has a terminal state (`done` or
`escalated`). Print a per-id summary:

```
Multi-dispatch complete.
  add-a       done       3 iterations, 14m 22s
  add-b       done       1 iteration,  22m 05s
  add-c       escalated  code stage subprocess failed with exit code 1
```

### 8. Failure recovery ladder

Same 3-step ladder as `/ithy-opsx:dispatch`:

1. **Preferred**: `despawn.sh $AGMSG_TEAM manager $entry_name` per
   worker that finished.
2. **On despawn failure**: targeted `leave.sh` + `tmux kill-pane`.
3. **NEVER** bare `reset.sh` without `agent_id`.

## Guardrails

- **Do NOT skip preflight**. A single unknown id in the input MUST
  block the whole invocation before any worker spawns. Half-
  spawning is worse than not spawning.
- **maxParallel is the concurrency cap for THIS invocation, not
  globally**. A parallel `/ithy-opsx:dispatch <single>` invocation
  running in a different Manager session is independent.
- **`change:<id>` matching is strict**. Legacy `stage:$S
  status:done` (no `change:<id>`) is accepted ONLY when exactly
  one in-flight change uses that `entry_name`. Ambiguous legacy
  messages are logged and skipped, not guessed.
- **Escalation is per-change**. Do not abort the whole loop when
  one change escalates — others continue.
- **Loop ceiling** (30 min default) is a safety cap on the entire
  invocation. Individual per-stage timeouts still apply per the
  standard dispatch skill.
- **Never modify code from the dispatcher session**. All code
  changes happen in dispatched worker invocations.
- **Do NOT retry a failed worker without changing input**. Same
  rule as single dispatch.

## See also

- `.claude/commands/ithy-opsx/dispatch.md` — the single-change
  dispatcher that this skill parallelises. Its per-stage
  mechanics (Dispatch helper protocol, 3-stage success contract,
  Manager-commit contract) apply verbatim per change here.
- `openspec/changes/archive/2026-07-19-add-parallel-execution-config/`
  — the `parallelExecution` config that enables worktree
  isolation.
- `openspec/changes/add-multi-dispatch-orchestrator/proposal.md` —
  the design rationale for this skill.
