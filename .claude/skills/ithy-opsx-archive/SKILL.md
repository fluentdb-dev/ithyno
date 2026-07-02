---
name: ithy-opsx-archive
description: The Claude-driven "archive as commit" flow for OpenSpec UI changes. Runs when the user invokes `/ithy-opsx:archive <id>` (from the Kanban Archive button or manually). Handles preflight → optional worktree merge → openspec archive → auto-drafted git commit → optional cleanup.
license: MIT
---

# `/ithy-opsx:archive <change-id>` — archive as commit

This skill is the recipe Claude runs when the user asks to archive a
change. It treats archive as the semantic boundary where a change
enters history and makes one git commit that captures the whole thing.

Landed by `add-ithy-opsx-archive` (see
`openspec/changes/add-ithy-opsx-archive/proposal.md`).

## When Claude runs this

- User types `/ithy-opsx:archive <id>` (the slash command entry lives at
  `.claude/commands/ithy-opsx/archive.md`).
- The OpenSpec UI dashboard's Archive button injects the same string in
  Claude mode.

## Steps

The order is **commit (agent's work) → merge → confirm → archive → commit
(archive) → cleanup**. Two commits land: one for the implementation
(the merge that pulls the agent branch into main), one for the archive
(the openspec file moves). This lets `git log` read as "we implemented
X" followed by "we archived X" — separate concerns, separate diffs.

### 1. Preflight

1. **Change exists.** `openspec/changes/<id>/` must be present. If not,
   stop with a clear error.
2. **Tasks are done.** Read `tasks.md`. Warn if there are unchecked
   items outside `## Verification` sections. Ask the user whether to
   proceed anyway (a docs-only outstanding item may be intentional).
3. **Outcome is written.** If `outcome.md` is missing, offer to draft
   one from the change's proposal + tasks. Do not proceed without it —
   archives without outcome files lose the "what we learned" record.
4. **Git identity is set.** Verify `git config user.name` and
   `user.email` resolve to something. If not, pause and point the user
   at the dashboard's Git panel (`add-git-identity`) — no point running
   further; commits will fail.

### 2. Commit the agent's uncommitted work (safety net)

> **Note**: When the default `/ithy-opsx:apply` skill was used to run
> the agent, the agent already committed its work at end-of-apply and
> this step is a no-op. It stays here as a safety net for non-Claude
> agents, users who invoked `/opsx:apply` directly, or apply runs that
> were interrupted before their own commit step. Detect the no-op via
> `git status --porcelain` — if clean, skip straight to step 3.

Only if a worktree exists for this change (`.worktrees/<id>/`):

1. Inside the worktree, check `git status --porcelain`. If clean, skip
   to step 3.
2. Otherwise the agent implemented the change but did not commit. Stage
   and commit on the agent branch:

   ```
   cd .worktrees/<id>
   git add .
   ```

3. Draft a commit message with this shape:

   ```
   agent: implement <change-id>

   <one-line summary of what was implemented — read tasks.md's completed
   items or the change's proposal Why for context>
   ```

4. Present the message to the user; wait for approval or edits; then:

   ```
   git commit -m "<the approved message>"
   ```

5. If pre-commit hooks fail, do NOT `--no-verify`. Report the hook's
   output and stop.

### 3. Merge to main

Return to the main working tree (`cd` back to the project root).

If a worktree exists — even one whose branch has zero commits ahead of
main after step 2 — merge it now:

```
git merge --no-ff agent/<id>
```

- `--no-ff` preserves the "we branched, we merged" shape so the agent's
  commits stay distinguishable from squashed archive noise.
- If merge conflicts: pause, list the conflicted files, tell the user
  to resolve in their editor and re-run `/ithy-opsx:archive <id>`. Do
  NOT proceed to archive on a half-merged tree.

If no worktree exists (the change was implemented directly on the
current branch), skip this step — nothing to merge.

### 4. Confirm before archiving

Show the user a compact status snapshot:

- `git status --short` (what's staged / dirty).
- `git log --oneline -5` (the last few commits, so the implementation
  merge is visible).
- The list of files under `openspec/changes/<id>/` that are about to
  move.

Then ask, plainly: **"Everything look right? Proceed to archive?"**

- If the user says no, stop. The implementation merge remains in main —
  they can archive later by re-running `/ithy-opsx:archive <id>`.
- If yes, continue to step 5.

### 5. Archive

Delegate to the OpenSpec CLI — it owns the file layout:

```
openspec archive <id>
```

(Equivalent to `/opsx:archive <id>` executed by upstream OpenSpec.)

Verify after:

- `openspec/changes/archive/*-<id>/` exists.
- `openspec/changes/<id>/` is gone.
- Any delta specs got folded into `openspec/specs/<capability>/`.

### 6. Commit the archive

Stage the archive step's file moves:

```
git add .
```

Draft the archive commit message with this shape:

```
archive: <change-id>

<one-line summary — first sentence of proposal.md's Why section, trimmed>

Tags: <tag1>, <tag2>, ...
```

Rules for the summary line:

- Trim to a single sentence.
- Do not include the change id (it's already in the subject).
- Keep it under 80 characters if possible.

Rules for the Tags trailer:

- Read `proposal.md`'s frontmatter `tags` field.
- Comma-separated, no leading `#`.
- Omit the trailer if the change has no tags.

Present the drafted message to the user. Wait for approval or edits,
then:

```
git commit -m "<the approved message>"
```

Same pre-commit hook rule: no `--no-verify`.

### 7. Cleanup (ask)

If step 3 merged a worktree branch, offer the destructive cleanup:

```
git worktree remove .worktrees/<id>
git branch -D agent/<id>
```

Ask before running. Default suggestion: yes. Skip if the user declines
(they may want to keep the branch around for reference).

### 8. Report

Tell the user:

- The implementation commit hash + subject (from step 3's merge, or
  step 2's commit if no merge happened).
- The archive commit hash + subject (from step 6).
- The new archive path: `openspec/changes/archive/<date>-<id>/`.
- Whether the worktree was cleaned up.

## What this skill does NOT do

- **Push to remote.** That's a separate decision; the user pushes when
  ready.
- **Resolve merge conflicts.** The skill pauses; the user resolves in
  their editor.
- **Rewrite history.** No amends, no rebases. One archive, one commit.
- **Multi-change batch archive.** One at a time.

## When something goes wrong

- **`openspec archive` reports validation errors.** Stop. Ask the user
  to run `openspec validate <id>` and fix. Do not commit a broken
  archive.
- **`git commit` fails because of pre-commit hooks.** Do NOT retry with
  `--no-verify`. Report the hook's message and let the user fix.
- **Uncommitted changes outside the archive step.** Detect via
  `git status --porcelain` before staging. If there are unrelated
  changes, ask whether to include them or stash first.

## See also

- The complementary `/ithy-opsx:merge <id>` (proposed in
  `docs/ideas/2026-07-01-merge-workflow-and-namespace.md`) — same
  pattern for the merge step alone, when archive isn't the goal.
- `.claude/skills/openspec-flow/SKILL.md` — the broader spec-driven
  workflow this skill is one step inside.
