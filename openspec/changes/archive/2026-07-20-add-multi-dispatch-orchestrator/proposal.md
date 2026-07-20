---
tags: [feature/dispatch, area/skills, area/agents, area/server]
---

# Add `/ithy-opsx:dispatch-multi` — parallel N-change orchestrator

## Why

`/ithy-opsx:dispatch <id>` (landed via `add-manager-loop-skill`) is a
single-change orchestrator: it drives one change through
`code → review → verify` and blocks on each stage's message wait
(5-second inbox poll, up to 15 min for code). Even with
`parallelExecution: true` (which enables worktree isolation),
launching two changes concurrently requires two separate dispatcher
processes — and today there is exactly one Manager per PTY session,
so two `Start` clicks are processed serially.

`parallelExecution: true` was intentionally scoped to the disk /
lock layer (per its outcome). The **orchestration layer** was left
for a follow-up because a well-designed multi-dispatch needs several
things the single-change dispatcher doesn't have:

1. A combined poll loop that watches for messages from multiple
   in-flight changes.
2. A concurrency cap that respects tmux pane count and CPU / memory.
3. A message-routing scheme that distinguishes which change a
   report is about (today's `stage:$S status:done` is unambiguous
   only because there's one dispatch at a time).

The pattern is well-worn now: multiple times per day, this repo has
2-3 changes queued up that could be worked on in parallel. Each
`code → review → verify` cycle runs 10-30 min. Running them
serially costs 40-90 min of clock time; parallelising drops that to
the slowest single change (say, 20-30 min).

## What Changes

### 1. New slash command + skill

- **`.claude/commands/ithy-opsx/dispatch-multi.md`** — slash command
  file exposing `/ithy-opsx:dispatch-multi <id1> [id2] [id3] ...`.
  Same shape as `.claude/commands/ithy-opsx/dispatch.md`, delegating
  to the new skill.
- **`.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`** — the
  orchestrator recipe. Parallelises the code stage across N changes,
  then advances each independently through review + verify.

### 2. Concurrency cap: `maxParallel` config

- **`agents.yaml`** grows an optional top-level `maxParallel: number`
  field (default `3` when absent). Interpretation:
  - When `dispatch-multi` receives more ids than `maxParallel`, it
    queues the excess and starts a new worker as running ones
    finish.
  - `1` degrades to the sequential behavior of `/ithy-opsx:dispatch`
    (useful for debugging, or for machines low on cores).
  - Range validated `[1, 10]`; values outside → validation error.
- **`server/agents/registry.ts`** — parse the field into
  `AgentConfig.maxParallel`; expose via `publicConfig()`.
- **`web/src/types.ts`** — mirror the field so a future UI can
  surface it in Settings.

### 3. Report contract extension: `change:<id>` suffix

Workers append `change:<change-id>` to their existing report token
so a single Manager inbox can disambiguate across in-flight
changes:

```
stage:code status:done change:add-kanban-search-filter
stage:review status:done change:add-light-dark-mode
```

- The existing `/ithy-opsx:dispatch` skill SHALL be updated to
  extend its boot-prompt's report contract with the change id
  clause. Backward-compat: the Manager's inbox parser accepts
  BOTH the old `stage:$S status:done` shape (assumed to match the
  sole in-flight change) and the new `... change:<id>` shape (for
  multi-dispatch).

### 4. Orchestrator recipe

`/ithy-opsx:dispatch-multi <id1> [id2] …`:

1. **Preflight** — validate every id resolves to an active change
   under `openspec/changes/<id>/`. Escalate on any unknown id
   before spawning anything.
2. **Concurrency capacity** — read `agents.yaml.maxParallel`
   (default `3`). Let `ACTIVE = min(len(ids), maxParallel)`.
3. **Per-change worktree setup** — apply the standard
   `git worktree add -b agent/<id> .worktrees/<id>` per id, exactly
   as single-dispatch does. Idempotent.
4. **Fan-out code stage** — for the first `ACTIVE` ids, spawn
   worker via the standard Dispatch helper protocol (agmsg
   preferred; Task/subprocess if agmsg not configured). Record
   `{id, entry, pane, PRE_HEAD, phase: "code"}` per in-flight
   entry.
5. **Combined poll loop** — single `while` loop polls the Manager
   inbox at 5-second intervals. For each unread message, parse
   `(stage, status, change)` from the body:
   - Match to the in-flight entry; if `stage` is `code` and
     `status` is `done`, commit the worker's tree (Manager-commit
     contract from single-dispatch), advance phase to `coded`,
     and immediately spawn the review worker. If `review`, judge
     verdict; on `pass` advance to `reviewed` and spawn verify.
     On `needs-rework`, loop back to code stage with prior
     findings (capped by `MAX_ITERATIONS` = 5).
   - After each finish (successful or escalated), pop the next
     queued id (if any) and spawn its code worker so `ACTIVE`
     concurrency is maintained.
6. **Termination** — loop ends when all ids reach either `done`
   or an escalation. Report a per-id status summary at exit.

### 5. Report shape

Exit output:

```
Multi-dispatch complete.
  add-kanban-search-filter  done       3 iterations, 14m
  add-light-dark-mode       done       1 iteration,  22m
```

Or on escalation:

```
Multi-dispatch partial.
  add-kanban-search-filter  done       1 iteration,  8m
  add-light-dark-mode       escalated  needs-human: <reason>
```

### 6. What this change does NOT touch

- **`/ithy-opsx:dispatch` semantics** — unchanged for single-id
  invocation. Only its report-contract boot-prompt is extended.
- **`agents.yaml` mode / roles / prompts** — unchanged. The
  existing agent entries still describe workers; multi-dispatch
  just fans them out.
- **Kanban Start button** — the button still fires
  `/ithy-opsx:dispatch <id>` for a single card. Multi-select Start
  on the Kanban is a separate follow-up (would inject
  `/ithy-opsx:dispatch-multi <id1> <id2> ...`).

## Spec deltas

- **`dashboard`** — **ADDED** `Multi-Dispatch Orchestrator`
  describing the new skill contract + `maxParallel` config +
  combined poll loop + `change:<id>` report token.

## Impact

- **Affected specs**: `dashboard` — 1 ADDED
- **Affected code**:
  - `.claude/commands/ithy-opsx/dispatch-multi.md` (new)
  - `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md` (new)
  - `.claude/skills/ithy-opsx-dispatch/SKILL.md` — extend report
    contract's boot-prompt to include `change:<id>`
  - `server/agents/registry.ts` — parse `maxParallel`, expose via
    `publicConfig()`
  - `server/agents/registry.test.ts` — 3-4 tests for the new field
  - `web/src/types.ts` — mirror `maxParallel` on `AgentConfig`
- **Risk**:
  - **Manager inbox parse compatibility** — old workers (single
    dispatch style) don't emit `change:<id>`. Parser matches BOTH
    shapes; single-dispatch stays correct because there's only
    one in-flight change per entry.
  - **Worker collision** — 2 concurrent workers using the same
    agent entry (both `claude` code workers, both invoked as
    `agmsg spawn claude-code claude ...`) may conflict on the
    tmux pane naming. Verified: `spawn.sh` generates unique pane
    ids per invocation, so multiple spawns of the same agent name
    coexist in separate panes.
  - **Manager cognitive load** — the combined poll loop's state
    is bigger (N in-flight entries vs 1). Bug risk during
    development; mitigated by starting with N=2 in the smoke and
    ramping to N=3 once the flow is stable.
- **Migration**: none. Existing single-dispatch behavior is
  unchanged.

## Related

- `openspec/changes/archive/2026-07-15-collapse-jobregistry-and-add-semaphore/`
  — the semaphore that gates `parallelExecution: false` mode.
- `openspec/changes/archive/2026-07-19-add-parallel-execution-config/`
  — the config that enables worktree isolation.
- `openspec/changes/archive/2026-07-19-add-opsx-revert-command/` —
  the earlier "wrap the workflow in tooling" pattern this proposal
  mirrors.
- `docs/architecture/parallel-shells.md` — the parallel-shells
  narrative; a paragraph will be appended describing dispatch-multi.
