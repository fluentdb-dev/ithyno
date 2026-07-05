---
status: idea
tags: [feature/workflow, area/skills, area/repo]
source: conversation
related:
  - .claude/skills/openspec-flow/SKILL.md
  - docs/ideas/2026-07-04-agent-roles-and-worktree-pool.md
promoted_to: null
---

# Phase-based integration branch workflow

Some multi-change work naturally clusters into a **phase** — a group
of interdependent changes that share files, need to land in a
specific order, or want a single "batch reveal" on main instead of a
staccato of individual archive commits. Today's workflow is
`agent/<id>` → merge to main → archive on main, one change at a
time. This idea captures a variant: an integration branch
(`phase-<theme>`) that collects several `agent/<id>` merges + their
archive commits, then folds into main atomically when the phase is
"done."

The idea is **not settled** — it graduates to a proposal only after
Phase 1 of the multi-agent redesign has actually run end-to-end
this way and the trip-ups are captured here.

## When to reach for it

- Multiple changes touch the **same source files** in incompatible
  ways (e.g. `add-agent-role-field` and `add-worktree-pool` both
  extend `AgentDef` + `agents.yaml.example`), so implementing them
  in parallel `.worktrees/<id>/` is not viable without conflicts.
- Wanting **external review** of the whole cluster before main
  moves, without opening N separate PRs.
- **Rollback atomicity**: reverting the phase merge on main should
  cleanly restore the pre-phase state, without hunting per-change
  archive commits.
- **Ordering enforcement**: change B depends on change A being
  materialized in the tree, but they're written together (both
  proposals are on main from the start).

## When NOT to use it

- Single independent change → default 1-change workflow is simpler.
- Changes that touch disjoint files → let them race on main.
- Doc-only changes → not worth the ceremony.

## Proposed shape

### Branch topology

```
main:           P0 — P1 — … — MP (batch merge)
                              /
phase-<theme>:  P0 — merge(A) — archive(A) — merge(B) — archive(B) — …
                     \
agent/<id A>:  P0 — impl(A)
                             \
agent/<id B>:  merge(A)-onto — impl(B)
```

- `P0` = last commit on main before the phase started (typically
  the propose commit for the whole phase's changes).
- `phase-<theme>` branches off main at `P0`.
- `agent/<id A>` also branches off `P0` (same starting point).
- `agent/<id B>` branches off `phase-<theme>` **after** A landed
  there, so B sees A's schema / API changes.
- `MP` = the final `git merge --no-ff phase-<theme>` on main.

### Steps per phase

1. **Propose all N changes on main** — proposal / tasks / specs delta
   for every change in the phase land on main as one commit or a
   short sequence of commits. The dashboard sees them all
   immediately.
2. **Create phase branch**: `git checkout -b phase-<theme>` on main.
3. **Implement first change** on `agent/<id-1>` (worktree, branched
   from main / P0). Impl + tests + outcome.md commit on the agent
   branch.
4. **Merge into phase branch**: `git merge --no-ff agent/<id-1>` on
   `phase-<theme>`. This is the "landed in the phase" event.
5. **Archive on phase branch**: `openspec archive <id-1>` — the
   spec delta folds into `openspec/specs/`, the change dir moves to
   `openspec/changes/archive/`, and an archive commit lands on
   `phase-<theme>`.
6. **Prepare next impl branch from the phase tip** (not main):
   `git worktree add .worktrees/<id-2> phase-<theme>` with
   `-b agent/<id-2>` off `phase-<theme>` so <id-2>'s work sees
   <id-1>'s merged + archived state.
7. Repeat steps 3–6 until every change in the phase is landed +
   archived on `phase-<theme>`.
8. **Merge phase to main**: `git checkout main` +
   `git merge --no-ff phase-<theme>`. All impl merges + all archive
   commits arrive on main as one topology event.
9. **Delete phase branch**: `git branch -d phase-<theme>` (safe —
   the merge preserved all commits).

### Naming

- Phase branches: `phase-<theme>` where `<theme>` is a short
  kebab-case topic (e.g. `phase-multi-agent`,
  `phase-review-gates`).
- Not `phase1-…` — the number encodes ordering, but branches are
  parallel-safe; a phase name is more durable than a phase
  number.

## Open questions (to answer via real usage)

- **Does `openspec archive` on a non-main branch behave?** The CLI
  moves files and touches spec dirs; if it has an assumption about
  branch identity (unlikely, but worth confirming), phase-branch
  archives break. **Verify on the first phase-branch archive
  attempt.**
- **Merge conflicts on the final phase → main merge.** If main
  moved during the phase (unrelated commits landed), the batch
  merge could conflict. Options: rebase `phase-<theme>` onto main
  head periodically, or accept the conflict-resolve step at the
  final merge. Depends on how much main moves during a typical
  phase.
- **Per-change vs per-phase outcome.md.** Every change already
  gets an outcome.md today. Under phase batching, is there a
  need for a top-level `openspec/changes/archive/phase-<theme>-
  outcome.md`? Possibly overkill; individual outcomes suffice.
- **Rollback semantics.** `git revert -m 1 <phase-merge-commit>`
  should back the whole phase out cleanly. Verify that
  `openspec validate --all` on main after the revert is clean
  (the spec delta merges undo cleanly).
- **PR / external review integration.** Push `phase-<theme>` to
  origin, open a PR against main. The PR shows every impl + every
  archive as a series of commits — is that a legible review
  surface, or is squash-merge preferable? Squash loses the archive
  commit structure that `openspec archive` intends. Preserve merge.
- **UI implications.** The dashboard reads `openspec/changes/**`.
  When a change is archived on a phase branch but not yet on
  main, the dashboard viewing main doesn't see it as archived.
  Only after the phase → main merge does the dashboard's Archive
  view include the changes. That's fine, but worth stating.
- **Sequencing communication.** The proposal for change B needs
  to reference "must merge after A." Idea files and proposal
  frontmatter don't have a formal "depends" field. Add one, or
  keep it in the proposal's Why paragraph? Leaning on prose for
  now.

## Preconditions for graduating this idea

Promote to a formal proposal (`add-phase-integration-flow` in
`.claude/skills/openspec-flow/SKILL.md` + a stage-② doc) only
when:

1. **Phase 1 of the multi-agent redesign** has completed this
   loop end-to-end (both `add-agent-role-field` and
   `add-worktree-pool` landed + archived on the phase branch,
   then batch-merged to main).
2. Each of the open questions above has a concrete
   answer-from-usage, not a guess.
3. A rollback drill has been performed once — take a completed
   phase merge, `git revert -m 1`, run `openspec validate --all`,
   confirm clean.

## Live log — Phase 1 (multi-agent) trip-ups as they happen

_This section fills in during Phase 1 execution. Every rough
edge belongs here so the eventual proposal captures the actual
pain surface._

- (initial state — no observations yet)

## Related prior work

- `docs/ideas/2026-07-04-agent-roles-and-worktree-pool.md` — the
  design cluster driving the first phase.
- `.claude/skills/openspec-flow/SKILL.md` — the current
  1-change-at-a-time workflow that this idea extends.
- `.claude/skills/openspec-flow/SKILL.md` §Revert — precedent
  for "codify after real usage" (Case α / β came out of running
  the flow, not designing it upfront).

## Status

Idea, unpromoted. See "Preconditions for graduating" above.
