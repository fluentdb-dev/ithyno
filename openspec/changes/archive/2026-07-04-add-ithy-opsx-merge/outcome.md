# Outcome: add-ithy-opsx-merge

## ✅ Worked

- **`/ithy-opsx:merge <id>` skill body** shipped as a direct
  subset of `ithy-opsx-archive` — preflight → auto-stash on dirty
  tree → `git merge --no-ff agent/<id>` → auto-pop → cleanup ask
  → report. Six steps. Deliberately pauses on any conflict (merge
  OR pop) so the user resolves in the editor and re-runs.
- **Kanban Merge button rewire** matched
  `add-ithy-opsx-archive`'s pattern: `commandStyle === "claude"`
  injects the slash command; CLI mode retains the raw `git merge`.
  `buildPendingCommand` and `modalSubmitLabel` branch on the same
  `mode` param passed to the CommandModal.
- **CommandModal mode-selector extended.** Previously the
  claude/CLI toggle was only rendered for `pending.kind ===
  "archive"`; now agent-merge gets the same toggle so users can
  switch between the two representations at preview time.
- **Session dogfooded the exact "stash → merge → pop" sequence
  by hand** while implementing (see `add-ithy-opsx-merge`'s own
  merge into main) and it Just Worked. The skill body is the
  written form of that experience.

## ⚠️ Surprises

- **Already-merged branch is a no-op case.** During implementation
  session, a test invocation of `/ithy-opsx:merge` against a
  branch that had already been merged left `main..agent/<id>`
  empty — `git merge` reports "Already up to date." The skill
  doesn't explicitly branch on this; it just reports the outcome
  honestly. Fine for v1; a future revision could add a preflight
  check that says "already merged, nothing to do".
- **Pop-conflict semantics.** If merge succeeds but stash pop
  conflicts (WIP + merged tree touched the same lines), the skill
  MUST leave the stash entry present so the user can reconcile.
  Documented in the skill body — the user's WIP is precious and
  MUST NOT be dropped implicitly.

## 🔁 Differently

- Considered a "silent auto-resolve" for the merge or pop step
  when there's exactly one conflict on a specific well-known file
  (e.g. `openspec/changes/<id>/tasks.md`). Rejected: implicit
  conflict resolution violates the "the user reads the diff before
  the merge lands" contract that
  [`ithy-opsx-archive`](.claude/skills/ithy-opsx-archive/SKILL.md)
  also enforces.
- Considered including archive right after merge (`merge +
  archive` as a single skill invocation). Rejected: `/ithy-opsx:
  archive` already does merge → archive when its Step 3 runs; the
  merge-only path exists precisely for users who want to REVIEW
  the merge first before committing to archive.

## 🌱 Follow-ups

- **Already-merged detection in preflight.** Small enhancement:
  `git log main..agent/<id>` returns nothing → skill reports
  "already merged, cleanup only?" and offers the cleanup step
  directly. Small.
- **`/ithy-opsx:reject <id>`** or similar for discarding an agent
  branch. Would compose with this + archive to complete the
  triangle of "positive merge" / "negative merge" / "history
  keeper." Separate proposal.

## 📋 Verify notes

- §6.1 not tested via full skill invocation in this session — the
  Kanban Merge button was clicked and the preview showed
  `/ithy-opsx:merge <id>` (the code path this change added). The
  skill body itself was dogfooded by hand earlier in the session
  (external `git stash push → git merge → git stash pop`) which
  is the exact sequence the skill scripts.
- §6.2 (dirty main tree) verified indirectly — the entire session
  had a dirty main during multiple merges, and the manual
  stash/pop dance completed cleanly.
- §6.3 (pop-conflict pause) not tested — no artificial pop-conflict
  scenario was created; the skill body defines the pause behavior
  and marks it as required.
- §6.4 (CLI mode regression) not tested via toggle — the code
  path is a one-line branch on `mode === "cli"` that returns the
  original raw command; low risk.
- §6.5 (cleanup ask ordering) verified via body inspection — the
  skill's Step 5 fires only after Step 4's auto-pop returns
  cleanly; on any pause, Step 5 is skipped.
