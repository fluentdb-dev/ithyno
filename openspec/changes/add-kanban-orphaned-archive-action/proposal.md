---
tags: [feature/kanban, feature/agent-runner, area/web]
---

## Why

`add-orphan-worktree-adoption` gave us server-side detection of stale
`.worktrees/` from crashed / pre-`/ithy-opsx:apply` runs. The Kanban
card now shows the `orphaned` badge, which is honest — but the actions
next to it are misleading:

- **Start** is visible. `isRunningOrPending(job)` returns false for
  `orphaned`, so the card thinks Start is legitimate. It isn't. When
  the user clicks it, the server returns 409 (`worktree already
  exists`) because a fresh spawn can't reuse the on-disk worktree.
- **Merge** is visible. It runs `git merge --no-ff agent/<id>`, but for
  the common orphaned case — an agent that never committed — the
  branch has zero commits ahead of main, so the "merge" is a no-op that
  doesn't actually integrate the worktree's uncommitted implementation
  files. The user thinks they merged; nothing landed.
- **Archive is missing.** The right verb for an orphaned worktree with
  pending implementation is `/ithy-opsx:archive`, which handles the
  commit-if-needed → merge → archive → commit chain end-to-end. Kanban
  offers no button for it (only ChangeDetail does), so the user has
  to know the terminal command or navigate away.

The card should tell the truth about what actions are safe to take,
and it should surface the right primary action for the orphaned state.

## What Changes

- **Hide `Start`** on any card whose latest job has an existing worktree
  (running, pending merge/discard, or orphaned). Trying to Start a
  change while its worktree is on disk is always the 409 path.
- **Add an `Archive` button** to the card's action row when the job
  status is `orphaned`. Clicking it injects
  `/ithy-opsx:archive <change-id>` into the embedded terminal — the
  same string ChangeDetail's Archive button already injects — so the
  skill takes over.
- **Style Archive as `primary`** so it visually reads as the intended
  next step, while `Merge`, `Discard`, and `View diff` stay in the
  ghost / secondary shape. The card's visual hierarchy matches the
  workflow: "close this out" over "run one specific git step."
- Nothing else changes: the badge, the progress bar, the running-state
  handling, and the ChangeDetail Archive button all stay as-is.

## Capabilities

### New Capabilities
<!-- none — extends the dashboard capability -->

### Modified Capabilities
- `dashboard`: the Kanban card's action row for a change with an
  existing worktree suppresses `Start` and, when the worktree is
  orphaned, surfaces `Archive` as the primary action pointing at the
  ithy-opsx-archive skill

## Impact

- `web/src/components/Kanban.tsx`:
  - `ChangeCard`'s action-row logic gains a "worktree exists" check
    that gates `Start` alongside the existing `!isRunningOrPending`
    check.
  - New `Archive` button rendered when `job.status === "orphaned"`;
    click handler mirrors the DONE-column Archive path (opens the
    existing CommandModal with `/ithy-opsx:archive` preview so the
    user still confirms before send).
  - `Archive` button uses the `action-btn primary` class family (or a
    new visual variant) so it reads as primary against the row's ghost
    buttons.
- `web/src/styles.css`: verify the `primary` action-btn variant renders
  as expected in the card context; small tweak if it clashes with the
  card background.
- No server changes. No new endpoints. No new agents.

## Out of scope

- **Renaming or restructuring `Merge` / `Discard`**. They remain as
  power-user escapes for the "I know what I want" cases.
- **A cross-card "archive all orphans" batch action**. If the operator
  has ten stale worktrees, one click per card is fine for v1.
- **Removing the ChangeDetail Archive button**. It's the same
  destination and users may land there via the card link; keep both
  entry points.
- **Warning the user about worktree conflicts before the skill runs**.
  The skill itself handles conflict pause with Claude-guided
  resolution; the Kanban button shouldn't try to preview that.
