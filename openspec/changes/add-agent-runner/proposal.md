---
tags: [feature/agent-runner, feature/kanban, area/server, area/web]
---

## Why

Implementation today is triggered by typing `/opsx:apply` (or this assistant)
into the embedded terminal. That works for a single human operator running a
single change at a time, but it does not scale to "multiple agents working in
parallel on different changes without stepping on each other's files." The
agent-assignment idea promised that capability; this change is its **first
concrete delivery** (MVP-1, see
[task-assignment](../../../docs/ideas/2026-06-24-task-assignment.md)).

The user-visible win: click a **Run** button on a change card, an agent gets
spawned in its own `git worktree`, the dashboard tails the agent's
stdout/stderr, and the user merges the result back when satisfied. Multiple
changes can run in parallel without conflicts because each agent has an
isolated working tree.

## What Changes

### Agent registry (`agents.yaml`)

A small YAML file at the project root defines available agents:

```yaml
agents:
  - name: claude
    description: Implements tasks using Claude Code via /opsx:apply
    command: claude
    args: ['/opsx:apply', '${change_id}']
```

Template variables: `${change_id}`, `${worktree_path}`, `${branch}`.

### Worktree spawn

When the user clicks Run:

1. Server creates `git worktree add .worktrees/<change-id> -b agent/<change-id>`
2. Server spawns the agent's `command` via `child_process.spawn` with
   `cwd=.worktrees/<change-id>/`.
3. stdout/stderr are streamed to all browser clients over WebSocket.
4. A `change-id → jobId` lock prevents a second Run while one is active.
5. On agent exit (success or failure), the job ends but **the worktree
   stays on disk** so the user can review the diff.

### UI

- Kanban cards get a **Run** button (in TODO and IN-PROGRESS columns). The
  button opens an agent picker if more than one agent is defined.
- A status badge appears on the card while running (animated dot + label),
  becomes "completed" or "failed" on exit.
- A new **`/agents` page** shows active jobs and recent history with a tail
  output viewer per job.
- Card gains **Merge** and **Discard** action buttons after an agent
  completes. Both use the existing `injectPty` to send `git merge` /
  `git worktree remove` into the embedded terminal — the dashboard never
  mutates git state itself.

### `.gitignore`

The change adds `.worktrees/` so worktree directories don't show up as
untracked.

## Capabilities

### New Capabilities
- `agent-runner`: spawn agents in isolated git worktrees, track job state
  per change, stream output, expose endpoints for run/cancel/list

### Modified Capabilities
- `dashboard`: kanban cards gain Run / Merge / Discard actions and an agent
  status badge; a new `/agents` page lists jobs

## Impact

- New `agents.yaml` parser on the server, plus a job + lock + worktree
  registry in memory
- New endpoints: `POST /api/agents/run`, `GET /api/agents/jobs`,
  `POST /api/agents/jobs/:id/cancel`
- New WebSocket events: `agent-job-started`, `agent-job-output`,
  `agent-job-finished`
- New `web/src/pages/Agents.tsx` and additions to `Kanban.tsx`
- New deps: `yaml` for parsing (`gray-matter`'s YAML is not exposed as a
  standalone parser)
- No new Anthropic-API integration; spawn-only, works with any CLI agent
