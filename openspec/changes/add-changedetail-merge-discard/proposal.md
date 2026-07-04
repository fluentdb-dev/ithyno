---
tags: [feature/ui, area/web]
---

## Why

The Kanban card exposes four post-run actions on a change with an
active job: **Archive**, **Merge**, **Discard**, **View diff**. The
ChangeDetail page — where a user lands after clicking into a change —
exposes only **Archive** (and **Start** via `useStartFlow`, added in
`add-parallel-start-launcher`).

That asymmetry breaks the invariant we assumed while designing the
Kanban actions: *"whatever the user can do to a change from Kanban,
they can also do from its detail view."* Users landing in ChangeDetail
after inspecting the diff have to go back to Overview to hit Merge or
Discard — extra clicks, and a broken mental model.

It also blocked `add-agent-runner`'s verify §13.5 / §13.6 (Merge /
Discard buttons injecting the right terminal commands) from being
executed against the detail view — the buttons aren't there, so the
verify is Kanban-only, which is a real gap.

## What Changes

- **Extract a shared `usePostRunActions` hook** (or extend
  `useStartFlow` — decide during design) that centralises the
  Merge/Discard command-modal wiring. Kanban and ChangeDetail both
  consume it. Same command-preview modal, same commandStyle branch
  (`claude` → `/ithy-opsx:merge`  → `/opsx:merge` when landed; `cli` →
  `git merge --no-ff agent/<id>` / `git worktree remove …`), same
  `worktreeProgress` clear-on-success behaviour.
- **Render Merge + Discard buttons in ChangeDetail's header** when the
  latest job for the change is in `completed` / `crashed` / `cancelled`
  / `orphaned` state — mirroring Kanban's `isPendingMergeOrDiscard`
  gating.
- **View diff button** is out of scope here — that's a separate
  `add-diff-viewer` follow-up territory. Focus this change on
  Merge/Discard specifically.

## Capabilities

### Modified Capabilities

- `dashboard`: the ChangeDetail header now exposes Merge/Discard
  alongside Archive when a job is in a post-run state.

## Impact

- New file `web/src/hooks/usePostRunActions.tsx` (or an extension of
  `useStartFlow.tsx` — TBD in tasks §1)
- `web/src/pages/ChangeDetail.tsx`: consume the hook, render buttons
- `web/src/components/Kanban.tsx`: refactor to use the same hook,
  remove duplicated command-modal wiring
- Small CSS: ensure the button row layout works in ChangeDetail's
  header (Kanban's `action-btn` styling should carry over)

## Out of scope

- **Server-side merge/discard endpoints.** Both actions inject the
  command into the embedded terminal; the server never executes them
  directly. Same architectural choice as add-agent-runner made
  originally.
- **View diff parity.** Separate follow-up; the diff viewer's placement
  on ChangeDetail vs Kanban has its own design questions.
- **Retro-verify add-agent-runner §13.5 / §13.6 against ChangeDetail.**
  Once this change lands, that verify becomes doable from both views;
  update the archive's outcome as a note, no need to un-archive.
