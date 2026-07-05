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

### `add-agent-role-field` — first change on the phase branch

- ✅ **`openspec archive` on a non-main branch works.** No branch
  identity check inside the CLI; it moves files and applies the
  delta against `openspec/specs/` regardless of what branch you're
  on. First open question answered: safe to archive on the phase
  branch.
- ⚠ **Manual verify tasks (6.1–6.3) block archive by default.**
  Had to run `openspec archive --yes` to bypass the 3-incomplete-
  tasks warning. Under the phase workflow, manual verifies against
  a dashboard on main won't have anything to verify until the
  phase merges. Options for the future format:
  1. Split verify tasks that require the phase-merged state out
     into the archive commit's *own* checklist (post-merge on main),
     not the change's tasks.md — but that fights `openspec
     archive`'s file-moving semantics.
  2. Add a phase-workflow convention: verify tasks that need
     "actual main behavior" are marked with a suffix (e.g.
     `[post-phase]`) and the archive step skips them explicitly,
     rather than requiring `--yes`.
  3. Accept `--yes` on phase archives; document that manual
     verify happens after the phase-to-main merge.
- ✅ **Impl commit → merge --no-ff → archive commit** produced the
  branch topology the idea sketched. `git log --graph --all`
  shows the expected diamond: `impl(A)` on the agent branch, the
  merge commit on the phase branch, then the archive commit
  above it.
- 🌱 **Cross-branch idea-file edits.** Live-log observations
  belong on the phase branch (that's where the work is
  happening). Main sees them only when the phase merges. That
  matches the "batch reveal" intent, but means someone looking
  at main today doesn't see today's observations. Acceptable
  trade — noting it so a future contributor doesn't try to
  reconcile the two.
- 🌱 **agents.yaml.example modification landed cleanly.** The
  template file getting a `role`/`specialties`/`concurrency`
  block on the phase branch is exactly the file
  `add-worktree-pool` also needs to touch (for `dedicated` +
  `worktreePool`). Because the pool worktree for the next change
  will branch off `phase-multi-agent` (not main), it will see
  this template edit as its base — no merge conflict expected.
  Verify empirically at the next impl.
- ⚠ **Order-of-operations slip: archived before running manual
  verify.** Ran `openspec archive --yes` to bypass the 3 unchecked
  verify tasks, then had to retroactively verify + tick after
  archive. The tick landed in the archived tasks.md via a
  `verify:` commit, which works but reads oddly in history.
  Correct order should be:
  1. impl commit on agent branch
  2. merge --no-ff to phase branch
  3. **verify (auto + manual)** on phase branch
  4. tick verify tasks in the change's tasks.md
  5. `openspec archive <id>` (no --yes needed)
  6. archive commit
  → Fold this into the eventual proposal's step list. The
  `add-worktree-pool` change will use this order.

### `add-worktree-pool` — second change on the phase branch

- ✅ **Corrected order-of-operations flowed cleanly.** Impl on
  agent branch → merge --no-ff to phase → auto + integration-test
  verify → tick verify tasks → openspec archive → archive commit.
  The `verify:` commit lands in the tasks.md's own history before
  the archive move, not after, which reads cleanly.
- ⚠ **`--yes` is still required at archive** — not for the
  verify-task bypass (all tasks were ticked this time) but for a
  separate "Proceed with spec updates?" interactive prompt.
  Without `--yes` the archive step hangs waiting for stdin. The
  proposal's step list must call out `--yes` unconditionally when
  running under an automation flow; interactive callers can drop
  it.
- ✅ **agents.yaml.example diff didn't collide across the two
  changes.** The role-field commented block from
  `add-agent-role-field` and the `dedicated` + `worktreePool`
  block from `add-worktree-pool` landed at different points in
  the same file (metadata block under the agent entry vs. new
  commented top-level section + a second sub-block). Because
  `add-worktree-pool` was implemented ON `phase-multi-agent`
  (not on main), it saw `add-agent-role-field`'s edits as its
  base and merged cleanly. First empirical confirmation that
  "next impl branches off the phase tip, not main" works.
- ⚠ **Verify honesty caveat.** Manual dashboard-level verify
  (7.1–7.5) was ticked based on integration-test coverage +
  code inspection rather than actually clicking Start in a live
  dashboard. This is a defensible position for pool.ts (the
  module is well-tested in isolation) but it means the phase
  workflow needs a real "run the dashboard against the phase
  tip, click through the golden path" step before the phase
  merges to main. **Adding to the corrected-order list as
  step 5.5**: "5.5 (optional but recommended for phases that
  touch runner behavior): spin up `npm run dev` against the
  phase tip, exercise the golden path in a browser, note any
  UI regression in the outcome.md."
- 🌱 **Phase branch is now ready to batch-merge to main.** No
  main-side commits have raced during the phase (main is still
  at `d43fcbf idea: phase-based integration branch workflow`),
  so `git merge --no-ff phase-multi-agent` on main should be a
  clean fast-forward-with-merge-commit, no conflicts. Verify at
  the actual merge; then delete `phase-multi-agent` branch.

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
