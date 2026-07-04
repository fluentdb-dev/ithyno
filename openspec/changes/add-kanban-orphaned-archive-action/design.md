## Context

`add-orphan-worktree-adoption` made the runner detect stale
`.worktrees/` at boot and expose them as `orphaned` jobs. Kanban
learned to show the badge. What Kanban did not learn is that the
card's action row — designed for the "TODO / IN-PROGRESS / DONE"
axis — makes wrong offers when a worktree is on disk:

- **Start** invites a spawn the server will refuse.
- **Merge** invites a merge the git tree can't fulfill (0-commit branch).
- **Archive** — the correct verb, backed by `/ithy-opsx:archive` — is
  reachable only via ChangeDetail or the terminal, not the card.

This change corrects the action row for the orphaned state.

## Goals / Non-Goals

**Goals:**
- No misleading `Start` when a worktree exists.
- `Archive` as the card's primary action for an orphaned worktree.
- Existing `Merge`, `Discard`, `View diff` remain as secondary actions
  for operators who want the exact underlying step.

**Non-Goals:**
- Rework of merge / discard.
- Batch archive.
- Removing ChangeDetail's Archive button (both entry points stay).
- Worktree conflict preview (skill handles it).

## Decisions

### "Worktree exists" gate for Start

The predicate is: the change has a job whose status is *not* `null` and
*not* one of the pre-run states (there are none — every entry means a
worktree exists or existed). So in practice: **if `job` is defined,
suppress Start**. That covers `running`, `completed`, `crashed`,
`cancelled`, and `orphaned`.

The card renders Start only when there is no worktree at all
(no job entry for this change). This is a small tightening of the
existing `!isRunningOrPending` guard.

### Archive button placement

The Archive button lives next to `Merge` / `Discard` / `View diff` in
the orphaned card's action row. It is rendered *before* those buttons
so its position matches "primary action left, escapes to the right."

Click handler opens the existing `CommandModal` with the archive
kind — the same modal the DONE-column Archive button uses today. The
preview reads `/ithy-opsx:archive <change-id>`, submit label reads
`Send /ithy-opsx:archive`. Nothing new to plumb; we're reusing what's
already there.

### Visual weight: `action-btn primary`

The class already exists — `.action-btn.primary` is used by
ChangeDetail's Start button. Reusing it here keeps the design system
one entry. If in the card context the color reads too loud against
the card background, adjust the class or add a card-specific tone,
but the default should ship.

### Suppress Start also for `running` and `orphaned` uniformly

Some operators may want a "cancel + restart" one-click. That's a
different change (`add-kanban-restart-action`, hypothetical). This
change stays scoped: **no Start when a worktree exists.**

### Don't add an "Archive" button for `completed` / `crashed` / `cancelled`

Those states already offer `Merge` and `Discard`, and the DONE-column
Archive button handles the "all tasks done" case. Adding a fourth
button to a post-run card would clutter without adding a new
capability. Orphaned is different because it's the state where
`/ithy-opsx:archive` is the *unique* correct verb — no other single
click covers the commit-then-merge-then-archive chain.

If, later, we decide `completed` cards should also get a one-click
archive, that's another small tightening — not scoped here.

## Alternatives considered

- **Show Start disabled with a tooltip** ("worktree exists — Archive
  or Discard first"). Rejected: silent hide is less noisy on a busy
  board.
- **Rename `Merge` to `Archive`** for orphaned. Rejected: they do
  different things; conflating them hides that.
- **Confirmation dialog before injecting `/ithy-opsx:archive`**. The
  existing CommandModal already provides review + confirm; no extra
  step needed.

## Risks

- **Users of the DONE-column Archive path may wonder why the orphaned
  card also has Archive.** Documented in the card tooltip: "Runs
  `/ithy-opsx:archive` — commits, merges, archives, and offers
  cleanup."
- **Card gets crowded** when running Start hides but the orphaned card
  gains Archive. Rows stay to ≤4 buttons (Archive + View diff + Merge +
  Discard) which is what the card already handles for
  `completed` / `crashed` / `cancelled`.
- **Skill absence** (project without the ithy-opsx skills): the injected
  command falls through to plain terminal input and does nothing.
  Non-fatal; the user sees the injected line and can react. If we
  want to gate the button on skill presence, that's a follow-up.
