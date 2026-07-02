---
tags: [feature/agent-runner, feature/kanban, area/server, area/web]
---

## Why

`add-worktree-tasks-watcher` gave us **live progress numbers** from a
running agent's worktree, and Kanban cards + the ChangeDetail progress
bar now reflect them. But the **task text itself** — checkboxes, section
titles, the tasks.md content the user is watching the agent update — is
still read from the main tree, so when the user navigates from a
"running" Kanban card into ChangeDetail they see the *unchecked*
main-tree tasks while the Kanban card's progress says otherwise.

The user's exact ask: **reflect the worktree content in the change
detail view, and if that's structurally hard, change the URL** so the
worktree state has its own address. Doing both is the right answer:
the URL becomes the switch, and the server serves worktree content
under that switch.

## What Changes

- **Server**: `GET /api/changes/:id` gains an optional query parameter
  `tree=worktree`. When present, the server reads the change from
  `.worktrees/<change-id>/openspec/changes/<change-id>/` instead of the
  main-tree `openspec/changes/<change-id>/`. If the worktree does not
  exist, the server returns 404 with a clear reason so the client can
  fall back to the main-tree view.
- **Web routing**: ChangeDetail reads the URL search param
  `tree=worktree`. When present, it fetches the change with that param
  and shows the worktree's tasks / proposal / delta content. Without the
  param, existing behavior (main-tree content) is unchanged.
- **Kanban card navigation**: when a change has an active worktree
  (running job or pending merge/discard), its card link resolves to
  `/change/:id?tree=worktree` so clicking a running card drops you into
  the state you were watching from the board. Cards without an active
  worktree keep the plain `/change/:id` link.
- **ChangeDetail affordance**: a small header pill "viewing worktree ·
  switch to main" links between the two views so the user can compare
  or confirm the mismatch (e.g., before merging).

The Kanban card's own progress bar and the ChangeDetail progress bar
continue to prefer the WS-driven `worktreeProgress` slice as before —
no regression there.

## Capabilities

### New Capabilities
<!-- none — extends existing capabilities -->

### Modified Capabilities
- `dashboard`: ChangeDetail can render the worktree version of a
  change; the Kanban card link points to that view when a worktree
  exists

## Impact

- `server/index.ts`: `GET /api/changes/:id` accepts `tree=worktree`; new
  helper resolves the worktree openspec dir (`.worktrees/<id>/openspec`)
  and parses the change from there, reusing the existing `parseChange`
  function.
- `server/parser/workspace.ts`: no changes required — `parseChange`
  already accepts an openspec-dir path; we just pass a different one.
- `web/src/api.ts`: `fetchChange(id, opts?)` grows an optional
  `{ tree?: "worktree" }` argument.
- `web/src/pages/ChangeDetail.tsx`: reads `useSearchParams()`, fetches
  the worktree change when `tree=worktree`, uses it as the source of
  truth for that render. Falls back to the store's main-tree change
  when the fetch fails (worktree gone / server 404).
- `web/src/components/Kanban.tsx`: the change card's `<Link>` `to`
  becomes `/change/${id}${activeWorktree ? "?tree=worktree" : ""}`;
  same helper (`hasActiveWorktree(change, job)`) as the badge logic.
- Small CSS pill for the "viewing worktree · switch to main" affordance
  in the ChangeDetail head.
- Docs: `docs/architecture/parallel-shells.md` grows one paragraph
  about the URL contract.

## Out of scope

- Editing the worktree tasks.md via the dashboard's `/api/tasks/toggle`
  endpoint. The current toggle path writes to the main tree — extending
  it to worktree is a separate change (has its own safety questions
  around race with the agent's writes).
- A live-diff view between the main tree and the worktree change. If
  useful later, layers on top of this change (`?tree=diff` param).
- Persisting the last-viewed tree per-change or per-tab. The URL is the
  full source of truth.
- Broadcasting worktree change updates over WS. This change fetches on
  navigation; `worktreeProgress` already handles the live tick counter.
  Full content refresh on WS could come later.
