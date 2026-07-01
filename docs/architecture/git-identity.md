---
status: settled
tags: [feature/git, area/server, area/web]
---

# Git identity in the dashboard

The dashboard is a first-class client for the workspace's git state: it
detects whether the project is a git repository, displays the identity that
commits would use, lets the user edit local `user.name` / `user.email`, and
can run `git init` from the UI when the workspace is not yet a repo.

Landed by `add-git-identity` (2026-07-01).

## Capability boundary

- **Local scope only.** `--global` is never written from the dashboard.
  Users who want a fallback identity set it once outside the app.
- **No commit creation.** `git init` does not make an initial commit —
  branch name, gitignore, and first content are user decisions.
- **Read-only identity display for effective values.** The chip and
  modal show the resolved chain (`local > global > system`) but can only
  mutate the local scope.

## Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/git/status` | `{ isRepo, root?, headBranch?, reason? }` | local |
| GET | `/api/git/config` | `{ effective, local }` — requires `isRepo` | local |
| POST | `/api/git/config` | Write `--local user.name` / `user.email`; empty string → unset | local + CSRF |
| POST | `/api/git/init` | Idempotent `git init` in project root | local + CSRF |

WebSocket: `{ type: "git-status-updated", gitStatus }` fires after any
successful mutation.

## Shell scope

The header chip and identity modal mount only in the **local-server** and
**Electron** shells. The **VS Code extension** shell delegates to VS
Code's own Source Control panel — mounting our chip there would compete
with a first-class native affordance. Detection is `typeof
window.acquireVsCodeApi === "function"` in `web/src/runtime/shell.ts`.

The ExecutionPicker's Worktree gate reads `gitStatus.isRepo` in all
shells; only the wording of the disabled reason branches on shell.

## Interaction with agent-runner (worktrees)

`git worktree add` requires a git repository. Before this change,
clicking Start (worktree mode) on a non-repo workspace failed with a raw
`fatal: not a git repository` after the fact. Now:

- ExecutionPicker's Worktree option is disabled with a clear reason when
  `gitStatus.isRepo === false`.
- The chip's warning dot marks the state at all times.
- The modal offers one-click `git init` to unblock the flow.

## Source layout

| Path | Role |
|---|---|
| `server/git/status.ts` | `.git` fast-path + `git rev-parse` detection |
| `server/git/config.ts` | `--show-scope --get` parsing + serialized local writes |
| `server/git/init.ts` | Idempotent `git init`, re-reads status after |
| `server/index.ts` | Four endpoints + WS `git-status-updated` |
| `web/src/runtime/shell.ts` | `isVsCodeShell()` — the one shell branch |
| `web/src/components/GitIdentityChip.tsx` | Header chip |
| `web/src/components/GitIdentityModal.tsx` | Modal (two states) |
| `web/src/components/Kanban.tsx` | ExecutionPicker's git-repo gate |
