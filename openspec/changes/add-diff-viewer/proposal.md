---
tags: [feature/diff-viewer, feature/agent-runner, area/web, area/server]
---

## Why

After an agent finishes in a worktree, the kanban card shows "Ready". To
see **what the agent actually changed**, the user must drop into a
terminal and run `git diff agent/<change-id>`. That breaks the UI loop —
the whole point of the dashboard is "watch agents work and merge from one
surface." Without an in-UI diff, parallel-agent dogfooding always ends
with a context switch to the shell.

This is Tier 1 of the parallel-worktree completion roadmap: close the
loop. When a job ends, the user should be able to **scan the diff,
spot-check the implementation, and approve or discard — all without
leaving the dashboard**.

## What Changes

Add a diff view to the dashboard surfaced from two entry points:

- **Job detail on `/agents`**: a new "Diff" tab next to the live output
  showing the changes the worktree branch introduces vs main.
- **Kanban card**: a "View diff" affordance on cards whose latest job is
  finished, opening the same view filtered to that change's branch.

The viewer renders a side-by-side or unified diff per file, with file-tree
navigation when the branch touches many files. It does not let the user
edit — review only. Approval still goes through the existing Merge button
that delegates `git merge` to the embedded terminal.

Server-side, a new `GET /api/agents/jobs/:id/diff` returns a structured
diff: per file, the path, the change kind (added / modified / deleted /
renamed), the unified hunks, and basic stats (insertions / deletions). The
implementation shells out to `git diff --unified=3` against the worktree's
branch base from inside the parent repository (no need to enter the
worktree to read the diff).

## Capabilities

### New Capabilities
- `diff-viewer`: server-side diff extraction for an agent job's branch
  plus the UI components to render it

### Modified Capabilities
- `agent-runner`: the job descriptor gains a server-side endpoint
  returning the diff and the API client gains a fetcher
- `dashboard`: `/agents` job detail acquires a Diff tab; kanban cards
  with a finished job acquire a "View diff" action

## Impact

- New `server/agents/diff.ts` — shells out to `git diff` and parses the
  output into a structured shape
- New `GET /api/agents/jobs/:id/diff` endpoint
- New `web/src/components/DiffView.tsx` and helpers for hunk rendering
- `web/src/pages/Agents.tsx` and `Kanban.tsx` gain entry points
- New CSS for diff colors, file-tree navigation, hunk display
- No new dependencies (the diff parser is hand-rolled; `diff` and
  `react-diff-viewer` style libraries are not pulled in for v1)
