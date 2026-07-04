---
tags: [feature/archive, feature/verify, area/skills]
---

## Why

The `/ithy-opsx:archive` skill (landed by `add-ithy-opsx-archive`)
treats the archive as a **workflow-level acceptance** — one commit lands
the change into history. But its current step order lets **unverified
work slip through**:

```
1. Preflight    ← warns on unchecked NON-verify tasks only; verify
                  section is silently allowed to be empty
2. Commit       ← agent's work committed
3. Merge        ← merged into main
4. Confirm
5. Archive      ← files moved to history
6. Commit
7. Cleanup
```

Concrete failure mode observed in the `add-electron-shell` archive
attempt: 33/40 tasks done, 7 verification tasks (10.1–10.7) unchecked,
merge + archive proceeded because the skill's preflight warned but did
not block. The change would have been declared "done in history" without
anyone ever running `npm run electron:dev`.

Writing "verify not done" in `outcome.md` is **not** a valid substitute
for actually verifying. If verification never happened, the change is
not done.

### Three acceptance boundaries

The workflow has three progressively-wider acceptance moments:

| Scope | Boundary | Meaning |
|---|---|---|
| **Worktree** | `git commit` on `agent/<id>` | "This work is finalized in the worktree" |
| **Main** | `git merge --no-ff` | "Main accepts this work" |
| **OpenSpec** | `openspec archive` | "This is written into project history" |

**Verify belongs before the worktree-scope commit** — because commit is
where the worktree scope declares itself done. Verifying against
uncommitted work in the worktree is the natural gate: verify in
`.worktrees/<id>/` (isolated from main), tick verify tasks in the
worktree's `tasks.md`, then commit those ticks as part of the
implementation commit. Merge and archive follow automatically.

## What Changes

### Skill: verify-first flow

Update `.claude/skills/ithy-opsx-archive/SKILL.md` to insert a
**Verify** step between preflight and commit, and to make verify
unchecked a **blocking** condition (not a warning):

```
1. Preflight (change / identity / worktree presence)
   ↳ block on unchecked verify tasks unless user explicitly says skip
2. Verify in worktree ← NEW
   ↳ Claude reads the change's Verification section, walks the user
     through each item, waits for them to run the check and tick it,
     then confirms
3. Commit (worktree scope acceptance)
4. Merge to main
5. Confirm
6. Archive
7. Commit archive
8. Cleanup (worktree + branch)
```

### Slash command entry

Update `.claude/commands/ithy-opsx/archive.md` to reflect the new step
order in its summary (the entry that end-users see when they type
`/ithy-opsx:archive`).

### Explicit skip escape hatch

A user who wants to archive without verification (rare: docs-only
changes, or verification that requires infra we don't have yet) can
respond `skip verify` when the preflight pauses. Skill records the
reason in the archive commit trailer:

```
archive: <id>

<summary>

Verify: skipped — <reason from user>
Tags: ...
```

This keeps the escape hatch visible in git history rather than silent.

### Docs

- `docs/architecture/parallel-shells.md`: add a short section on the
  three acceptance boundaries and where verify sits.

## Capabilities

### Modified Capabilities

- `dashboard`: the archive-workflow requirement (which was added by
  `add-ithy-opsx-archive`) is extended with a new scenario about the
  verify block.

## Impact

- `.claude/skills/ithy-opsx-archive/SKILL.md` — Step 2 inserted, Step 1
  preflight rule changed from warn to block on unchecked verify,
  commit-message trailer for skipped verify added
- `.claude/commands/ithy-opsx/archive.md` — summary list updated
- `docs/architecture/parallel-shells.md` — new "Three acceptance
  boundaries" section
- `openspec/specs/dashboard/spec.md` (via delta) — new scenario for
  the verify block

## Out of scope

- **`/ithy-opsx:verify <id>` as a standalone slash command.** Attractive
  future work (walk-through outside the archive path) but not needed
  here — the archive skill's step 2 covers the in-flow case.
- **Auto-running verify commands.** The skill guides the user through
  verification, it does not execute `npm run electron:dev` etc. itself
  — verification often requires human observation (UI interactions,
  DMG open) that a headless step cannot substitute for.
- **Worktree-side dashboard verify UI.** A dedicated "Verify in worktree"
  button on the orphaned Kanban card is a nice UX add but a separate
  change; this proposal is skill-only.
- **Retroactive verify for already-merged `add-electron-shell`.** That
  case is handled outside this proposal (verify against main tree +
  archive after tick).
