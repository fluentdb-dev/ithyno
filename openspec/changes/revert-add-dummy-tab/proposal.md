---
tags: [revert, dashboard, testing, multi-agent-verify]
---

# Revert add-dummy-tab

## Why

`add-dummy-tab` was **explicitly designed as a throwaway verification
change** — its `proposal.md` (`openspec/changes/add-dummy-tab/proposal.md`)
opens with:

> この change は最終的に revert される前提 (`revert-add-dummy-tab`) で、
> 検証が終わったら痕跡なく消える設計。

The verification is done:

- **Multi-agent dispatch chain**: `/ithy-opsx:dispatch add-dummy-tab`
  was executed end-to-end across 2 iterations, exercising code (Claude
  Task tool) → review (Copilot subprocess) with the 3-stage success
  contract, priorFindings serialization, and lock-based gating.
  Result: PASS (documented in the archived outcomes for
  `redesign-skill-namespace-and-dispatch` and
  `collapse-jobregistry-and-add-semaphore`).
- **Folder-driven Kanban placement**: verified via Puppeteer that
  add-dummy-tab moved from TODO → IN-PROGRESS on the strength of the
  worktree signal alone.
- **`.worktrees/.lock` semaphore**: A/B/C scenarios all PASS.

The Playground tab that add-dummy-tab would ship is **not a permanent
feature** — it exists only as a target for the verification exercises
above. Now that the verifications are complete, the Playground tab
should be removed and add-dummy-tab archived as history.

## Case classification

**Case β**: `add-dummy-tab` is in-flight (never archived), so its
`ADDED Playground Tab` requirement never landed in the current
`openspec/specs/dashboard/spec.md`. The reversal therefore consists
of:

1. **Not archiving the ADDED delta**. We delete `openspec/changes/
   add-dummy-tab/specs/` before archiving, so `openspec archive
   add-dummy-tab` folds nothing into the current spec.
2. **Rewriting the target's outcome.md** to record that the change
   was intentionally reverted post-verification (not implemented as
   a permanent feature).
3. **Archiving the target** so it appears in `openspec/changes/
   archive/YYYY-MM-DD-add-dummy-tab/` as a documented experiment.
4. **Deleting the worktree branch + directory** (`git worktree remove
   .worktrees/add-dummy-tab` + `git branch -D agent/add-dummy-tab`)
   so the Playground impl doesn't linger in the filesystem.

This revert change itself adds a small documentation-only requirement
to the `dashboard` capability so the "we tested this and cancelled"
decision has a spec-level trace.

## What Changes

### 1. Reverted-target archive

- Delete `openspec/changes/add-dummy-tab/specs/dashboard/spec.md` (and
  the empty `specs/dashboard/`, `specs/` directories).
- Rewrite `openspec/changes/add-dummy-tab/outcome.md` (or create fresh)
  to document the revert reason and link to this change.
- Run `openspec archive add-dummy-tab` — the change moves under
  `archive/YYYY-MM-DD-add-dummy-tab/` with no spec fold.

### 2. Worktree cleanup

- `git worktree remove .worktrees/add-dummy-tab`
- `git branch -D agent/add-dummy-tab`

Both are safe: the worktree's impl commits (`a73655e`, `64dd56a`)
were verification-only, never intended for main. Discarding them is
the whole point of the revert.

### 3. Spec anchor for the "verified via throwaway change" pattern

Add a single documentation-only requirement in `dashboard` capturing
the pattern used for these verifications: **a change proposal MAY be
introduced as a throwaway verification target, provided the proposal
frontmatter names its intended revert change up front and the revert
change lands after verification completes**. This gives future
throwaway experiments a spec-level template.

## Impact

- **Affected specs**: `dashboard` — 1 ADDED (documentation-only
  pattern requirement)
- **Affected code**: none in main tree. Worktree files (Playground
  tab + tests) are discarded as part of the revert.
- **Risk**:
  - Deleting the `agent/add-dummy-tab` branch is destructive. Any
    reviewer who wants to inspect the impl can `git show a73655e
    64dd56a` from the archived history before we run `branch -D`.
    Verification screenshots already captured what we needed.
  - The archive record (`openspec/changes/archive/YYYY-MM-DD-add-
    dummy-tab/`) will keep the proposal + tasks + outcome, so the
    reversal is fully documented.
- **Migration**: none. Nothing landed to migrate away from.
