---
tags: [feature/agents, feature/ui, area/server, area/web]
---

## Why

Kanban's Start → Worktree flow silently succeeds when the change's
`proposal.md` is present in the main tree but not committed. The
runner calls `git worktree add HEAD` and the worktree is built from
the last commit — untracked files stay behind. The agent enters an
empty change directory, `ithy-opsx-apply`'s preflight halts with
"change doesn't exist," and the user loses the round trip (agent
spawn + several seconds).

This is a normal flow. Every propose landing hits it: `/opsx:propose
"…"` in the embedded terminal writes the files; the user clicks
Start next. No commit has happened yet. The propose author has no
signal that something's off until the agent completes with zero work.

## What Changes

**UI-side guard only — no runner-side auto-copy or auto-commit** (per
the design decision: keep the runner unchanged; make the missing
state visible where the user is about to act).

- New endpoint `GET /api/changes/:id/git-state`. Returns
  `{ untracked: string[], modified: string[] }` for
  `openspec/changes/<id>/` relative to the main tree's HEAD. Uses
  `git status --porcelain -- openspec/changes/<id>/` under the hood.
  Localhost-only, token-gated like every other GET (same
  `checkAuthHttp` path).
- Kanban's `startImplementation(change)` (via `useStartFlow`) queries
  the endpoint **before** dispatching the Worktree branch of Start.
  If `untracked.length > 0 || modified.length > 0`, open a
  `UncommittedProposalModal` instead of running the agent immediately.
- The modal shows the file list and offers two actions:
  - **Commit & Start** — POST `/api/changes/:id/commit-proposal` (new
    endpoint: `git add openspec/changes/<id>/ && git commit -m
    "propose: <id>"`), then continue with the original `runAgent`
    call.
  - **Cancel** — close the modal, do nothing. The user can commit
    manually and re-press Start.
- The Terminal branch of Start is **unchanged** — that path runs
  `/opsx:apply` inline in the embedded shell, which reads the main
  tree directly. Untracked files are visible there.

## Capabilities

### Modified Capabilities

- `dashboard`: Start (Worktree mode) now gates on the change's
  proposal directory being committed; the guard is user-facing and
  opt-out (Commit & Start proceeds, Cancel returns control).

## Impact

- `server/index.ts`: two new endpoints (`GET .../git-state`, `POST
  .../commit-proposal`) + the underlying `git status --porcelain --
  <path>` and `git add / git commit` execFile calls
- `web/src/api.ts`: `fetchChangeGitState`, `commitChangeProposal`
- `web/src/components/UncommittedProposalModal.tsx`: new
- `web/src/hooks/useStartFlow.tsx`: gate the Worktree branch on the
  new pre-check; wire the modal into the returned `startFlowModals`

## Out of scope

- **Runner-side proposal handling.** Considered (auto-copy proposal
  dir into worktree, or auto-commit before worktree add), rejected in
  favour of the UI-side gate — keeps the runner boring and puts the
  decision in front of the user who's about to spawn work.
- **Detecting other untracked files** that would also be missing from
  the worktree (unrelated files under `web/src/`, etc.). Out of scope
  because the propose→start flow specifically has an idiomatic
  outcome (a fresh proposal dir); generalising the check is a
  separate design question and would add more noise than value in the
  common case.
- **Kanban card badge / persistent "uncommitted" indicator** on the
  card itself. Nice-to-have follow-up; the modal at Start time is
  sufficient for the immediate footgun.
