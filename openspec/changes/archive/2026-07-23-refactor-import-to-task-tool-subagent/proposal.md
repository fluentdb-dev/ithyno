---
tags: [import, refactor, dashboard, agents, task-tool]
execution: worktree
---

## Why

`import-project-spec-generation` (archived 2026-07-22) shipped with
a transport that spawns `claude -p` as a subprocess from the Fastify
server. That choice looked pragmatic but has structural problems:

1. **Non-interactive** — `claude -p` runs in print mode. Import needs
   to explore a real repo, discover which docs and code files matter,
   and adapt per-project. That's an interactive judgment call, not
   something an API prompt can specify up-front.
2. **Permission bypass** — `claude -p` sidesteps Claude Code's normal
   permission system (file access, MCP servers, tool auth). Ithyno
   would need to build a parallel authorization layer, which it
   doesn't have.
3. **Fragile transport** — 10-min timeout + SIGKILL grace, stdout
   parsing for progress markers, subprocess lifecycle wired to SSE.
   Round 1 review flagged 3 major bugs from this design (client
   disconnect leaks, no timeout, `onComplete` in render); more will
   follow.
4. **Excludes users** — an alternative sketch (agmsg spawn to a tmux
   pane) was considered but rejected: agmsg is optional configuration,
   not universal. A design that assumes agmsg would exclude any user
   who hasn't set it up.

The right primitive is Claude Code's built-in **Task tool**
(sub-agent spawn):

- **Context isolation** — the sub-agent's Read / Grep / Bash calls do
  NOT pollute the parent Manager's context. Manager gets a summary at
  the end.
- **Agmsg-free** — Task tool is built into Claude Code; no side setup
  required.
- **Permission inheritance** — the sub-agent inherits its parent
  session's permission model.
- **Autonomous exploration** — the sub-agent can Read/Grep/Bash to
  discover which docs and code matter, then draft specs based on
  what it finds.

## What Changes

- **New skill `/ithy-opsx:import <target-path>`** (or extended existing
  skill) — when invoked in the Manager's Claude Code session, uses the
  Task tool to spawn a code sub-agent whose boot prompt is tailored for
  the import task (target path, no-commit rule, capability-discovery
  guidance, `openspec init` + `openspec/specs/` write instructions).

- **`POST /api/import/spec-generation` demoted to launcher** — the
  endpoint no longer spawns a subprocess. Instead it:
  1. Runs preflight (existing openspec/ check, size cap, path
     authorization) — unchanged from archived design.
  2. Injects `/ithy-opsx:import <target-path>` into the ithyno-side
     Manager PTY, using the same inject mechanism the Kanban Start
     button uses (`add-parallel-start-launcher` / `add-agent-stdin-relay`).
  3. Returns `{ jobId }` and an accepted status.

- **Progress signal via file watch** — the server's existing WS
  broadcaster already publishes `state-replaced` events when files
  change in the workspace. The dashboard watches for the appearance of
  `openspec/GENERATED.md` in the target project and treats that as the
  completion signal. No SSE stream of subprocess stdout.

- **`server/import-spec-gen.ts` shrinks** — subprocess spawn, timeout /
  SIGKILL, LRU eviction, SSE keepalive, `attachPtyToSocket`-style
  lifecycle code all go away.

- **`web/src/components/ImportProgress.tsx` simplified** — replaces
  the EventSource consumer with a file-watch based transition (subscribe
  to WS state-replaced; when `openspec/GENERATED.md` is present, fire
  `onComplete`).

- **Boot prompt authoring** — the skill's Task-tool prompt encodes:
  - "You are the import sub-agent for `<target-path>`."
  - "Discover capabilities by reading README.md, CLAUDE.md,
    CONTRIBUTING.md, docs/**/*.md, and a bounded sample of the source
    tree (language-aware: `lib/` for Flutter, `src/` for Node/Rust,
    etc.)."
  - "Run `openspec init` at `<target-path>` first."
  - "Write `openspec/specs/<capability>/spec.md` for each capability
    you identify. Every requirement follows OpenSpec SHALL + Scenario
    shape."
  - "Write `openspec/GENERATED.md` with header, timestamp, and
    per-capability list."
  - "DO NOT commit."

## Success

- Trigger Import on the fluentdb boilerplate repo →
  ithyno's Manager PTY receives `/ithy-opsx:import <path>` →
  Manager runs the skill → Task tool spawns a code sub-agent →
  sub-agent reads code + docs, writes `openspec/specs/` + `GENERATED.md`
  in target → server's file watcher publishes `state-replaced` →
  dashboard transitions to the newly-initialized project's Kanban.
- No `claude -p` subprocess spawned by the server.
- No 10-min timeout, no SIGKILL, no stdout parsing.
- Manager's context is NOT flooded with the sub-agent's discovery
  reads (verified: Manager sees only the summary the sub-agent returns).
- Users without agmsg can run Import successfully.
- Preflight guards (existing openspec/ → 409, size cap → 400,
  unauthorized path → 403) still block the same cases.
- Post-import banner and no-auto-commit invariant unchanged.

## Non-goals

- This change does NOT alter the `openspec/GENERATED.md` marker
  contract (still written at project root with header + timestamp +
  capability list).
- This change does NOT introduce a user-facing conversation with the
  sub-agent mid-run — Task-tool sub-agents are one-shot from the
  Manager's perspective. If autonomous exploration proves insufficient,
  a future change may add a "interactive escalation" back-channel; not
  in scope here.
- No behavior change for `unify-open-project-3-branch` or
  `guard-terminal-autolaunch-on-agents-yaml`.
