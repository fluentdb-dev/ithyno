---
name: "ITHY-OPSX: Dispatch Multi"
description: Parallel N-change dispatcher — fan out code/review/verify across multiple changes concurrently (Claude follows the ithy-opsx-dispatch-multi skill)
category: Workflow
tags: [workflow, dispatch, orchestrator, parallel, ithy-opsx]
argument-hint: "<id1> [id2] [id3] ..."
---

Dispatch code / review / verify workers for MULTIPLE changes
concurrently, following the same per-change semantics as
`/ithy-opsx:dispatch` but with a combined poll loop that watches
all in-flight workers at once.

**Input**: `$ARGUMENTS` is a space-separated list of change ids.

**Concurrency cap**: `agents.yaml.maxParallel` (default `3`, range
`[1, 10]`). When `len(ids) > maxParallel`, the excess ids queue and
start as running ones finish.

**How to run this**

Follow the **`ithy-opsx-dispatch-multi`** skill (see
`.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`) for the ids in
`$ARGUMENTS`.

The skill covers:

1. **Preflight** — validate every id resolves to an active change
   under `openspec/changes/<id>/`. Escalate the first unknown id
   before spawning anything.
2. **Capacity resolution** — read `maxParallel`, compute
   `ACTIVE = min(len(ids), maxParallel)`.
3. **Per-change worktree setup** — same idempotent
   `git worktree add -b agent/<id> .worktrees/<id>` as single
   dispatch.
4. **Fan-out code stage** — spawn `ACTIVE` code workers concurrently
   via the standard Dispatch helper protocol.
5. **Combined poll loop** — one `while` loop over the Manager inbox;
   route each message to its `(stage, change)` owner via the extended
   report contract (`stage:$S status:done change:<id>`).
6. **Per-change advance** — commit worker output on `code done`,
   advance phase, spawn next stage (review, then verify). Loop back
   to code on `needs-rework`.
7. **Queue drain** — as each change reaches a terminal state, pop the
   next queued id and spawn its code stage.
8. **Termination** — end when every id is `done` or `escalated`.
   Report per-id summary.
9. **Manager activity publication** — post to
   `POST /api/manager/activity` at every per-change boundary
   (`dispatching` → `waiting` → `judging` → `cleanup` →
   `transitioning` → `idle`) so each Kanban card shows what Manager
   is doing for THAT change. Every post carries its own `changeId`;
   parallel dispatches never share a badge. Requires
   the authoritative `ITHYNO_BASE` / `ITHYNO_PORT` and
   `ITHYNO_SESSION_TOKEN` exported into the Manager PTY. Missing
   session context stops dispatch before worker routing; individual
   activity publication failures remain best-effort after that guard.
   Landed by expose-manager-activity-per-change.

Do not skip steps. Respect `MAX_ITERATIONS = 5` per change.
Escalation of one change does NOT stop the others.

Landed by add-multi-dispatch-orchestrator.
