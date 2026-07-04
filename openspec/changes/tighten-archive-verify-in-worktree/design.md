## Context

The `add-ithy-opsx-archive` change made archive a single-commit
workflow-level boundary. In doggy-fooding, we hit a case where the
skill's preflight only warned (not blocked) on unchecked verify tasks,
and the archive proceeded on unverified work. This design note captures
why verify needs to be a **blocking** gate, and why it belongs
**before** the worktree-scope commit.

## Constraints

- **Skill files are prose**. The "spec" for the skill's behavior is the
  Markdown itself; a change here is fundamentally an edit to
  `.claude/skills/ithy-opsx-archive/SKILL.md`. The observable behavior
  is what a user sees when they run `/ithy-opsx:archive <id>`.
- **Verification is human-observed**. Most verify tasks are UI
  interactions ("open the app, click Open Recent, confirm it renders")
  or artifact checks ("DMG opens on macOS"). We cannot execute them
  automatically from the skill.
- **The worktree branch is the isolation boundary**. Verify runs in
  `.worktrees/<id>/` — main is unaffected until merge.

## Decisions

### Verify comes BEFORE the worktree-scope commit

Two options were considered:

**Option A**: Verify against uncommitted worktree state, then commit.
- Pro: Matches "commit is worktree-scope acceptance" cleanly. The
  commit represents "verified, done."
- Con: If verification reveals a bug and the fix requires a second
  round of edits, we've re-verified against the fresh state — extra
  round-trip.

**Option B**: Commit first, then verify against committed HEAD.
- Pro: Verification runs against a stable, reproducible state
  (hash-pinned).
- Con: Commit semantics get muddy — "we've committed but not verified"
  is a stuck state that ithy-opsx-apply's auto-commit puts us in
  today.

**Chosen: A**. The skill guides verify against the worktree's current
state (which may be pre- or post-`/ithy-opsx:apply`'s auto-commit). If
verify fails, the user fixes and we loop back. If verify passes, the
skill's Step 3 commits the current state (including verify ticks in
`tasks.md`).

For the `/ithy-opsx:apply` case where the agent already committed at
end-of-apply, verify still happens against the worktree — the user
ticks verify tasks, and Step 3 adds a small follow-up commit for
those ticks (or amends if the user prefers; skill defaults to a
separate commit for auditability).

### Verify unchecked BLOCKS, not warns

The current skill:

> Warn if there are unchecked items outside `## Verification` sections.

The new skill:

> Block if there are unchecked items in `## Verification` sections. The
> user must either complete each item (walking through the check and
> ticking it) or explicitly respond `skip verify: <reason>` to proceed.

Rationale:
- Warnings that don't block train the user to ignore them. Warned
  behavior in dogfooding: I read the warning and proceeded anyway.
- A block with an explicit escape hatch (`skip verify: <reason>`)
  forces the user to name why they're skipping, and records the reason
  in the commit trailer. Silent skips become impossible.

Non-verify unchecked items remain a **warn** (the existing behavior)
because they're often docs items that don't need blocking (e.g.,
"update parallel-shells.md — deferred to next follow-up").

### Escape hatch in commit trailer

When the user types `skip verify: <reason>`, the archive commit gets a
`Verify: skipped — <reason>` trailer:

```
archive: add-electron-shell

Bundle the Electron BrowserWindow shell so users without an editor
can launch the dashboard.

Verify: skipped — packaging pending in add-electron-packaging follow-up
Tags: feature/electron, area/electron, area/build
```

`git log --grep 'Verify: skipped'` becomes a searchable index of
unverified archives — a debt tracker. This trailer is only added when
the escape hatch is used; verified archives get no trailer.

## Alternatives considered

### Standalone `/ithy-opsx:verify <id>` slash command

Not chosen for v1. Attractive as a way to verify without the archive
pressure, but adds surface area and coordination with the archive
skill (does verify-then-archive re-check?). Defer to a follow-up if
the archive-embedded verify proves too coupled.

### Server-side "verify complete" state

A `verified` boolean on the change's server state, gated on all verify
tasks ticked. UI could show a "verify pending" badge and block Archive
UI-side. Rejected as v1 because the skill-level check is enough — the
UI can just call the same skill and let it block. UI-side gating is a
possible future add.

### Auto-execute verify commands

Skill parses verify task text like "run `npm run electron:dev`" and
executes it. Rejected: most verify tasks require human observation
(UI interaction, visual confirmation, packaged-artifact checks). A
half-automated verify is worse than a fully-manual one because it
gives false confidence.

## Migration

- The current `add-electron-shell` merged-but-unarchived case is
  handled OUTSIDE this proposal (as a one-off cleanup: verify against
  main tree, tick, run archive).
- Future archives run under the new flow automatically once the skill
  is updated.
- No spec / data migration needed — the skill is prose.

## Rollout

- Land skill update + command update + doc update in one commit.
- Test against a low-risk archive (`add-kanban-orphaned-archive-action`
  or similar) as the first run under the new flow.
- If the block-on-unchecked-verify turns out to be too strict in
  practice, adjust the escape-hatch keyword or add per-task skip.
