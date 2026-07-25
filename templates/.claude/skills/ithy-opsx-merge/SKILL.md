---
name: ithy-opsx-merge
description: The Claude-driven "merge with auto-stash" flow for OpenSpec UI agent branches. Runs when the user invokes `/ithy-opsx:merge <id>` (from the Kanban Merge button or manually). Handles preflight → auto-stash on dirty tree → `git merge --no-ff agent/<id>` → auto-pop → optional cleanup.
---

# `/ithy-opsx:merge <change-id>` — merge with auto-stash

This skill is the recipe Claude runs when the user asks to merge an
agent worktree branch into main. It exists because the raw
`git merge --no-ff agent/<id>` aborts as soon as the main tree has any
uncommitted files — which, in the dogfooding loop, is constantly.

Landed by `add-ithy-opsx-merge` (see
`openspec/changes/add-ithy-opsx-merge/proposal.md`).

## When Claude runs this

- User types `/ithy-opsx:merge <id>` (the slash command entry lives at
  `.claude/commands/ithy-opsx/merge.md`).
- The OpenSpec UI dashboard's Kanban Merge button injects the same
  string in Claude mode.

## Steps

The order is **preflight → auto-stash → merge → auto-pop → cleanup ask
→ report**. On any conflict (either in the merge or in the pop), the
skill pauses so the user can resolve in their editor and re-run.

### 1. Preflight

1. **Change id supplied.** If `$ARGUMENTS` is empty, ask the user
   which change to merge (offer active worktree branches from
   `git branch --list 'agent/*'`).
2. **Agent branch exists.** `git rev-parse --verify agent/<id>`; if
   this fails, stop with a clear error ("no agent branch for `<id>`;
   did you mean `<other>`?").
3. **Git identity is set.** Verify `git config user.name` and
   `user.email` resolve to something. If not, pause and point the
   user at the dashboard's Git panel (`add-git-identity`) — merges
   fail without an identity.
4. **Capture the dirty state.** Run `git status --porcelain` and
   remember whether the output is empty. That flag is what step 2
   consumes.

### 2. Auto-stash (only if dirty)

If preflight said the tree was clean, skip this step.

Otherwise:

```
git stash push -u -m "wip pre-merge <id>"
```

- `-u` includes untracked files so the merge can rearrange the tree
  freely.
- The `wip pre-merge <id>` message is deliberate — it makes the
  stash easy to find with `git stash list` if step 3 or step 4 pauses.

If the stash fails (rare — usually only when the repo is corrupted or
locked), stop with the error message.

### 3. Merge

```
git merge --no-ff agent/<id>
```

- `--no-ff` preserves the "we branched, we merged" shape so the
  agent's commits stay distinguishable in `git log --graph`.
- On merge conflict:
  - Pause with a clear message:
    > Merge conflicts in `<file list>`. Resolve them in your editor
    > (or IDE), then re-run `/ithy-opsx:merge <id>`. Your WIP stash
    > (if any) is still present — I have NOT popped it yet.
  - Do NOT attempt to pop the stash. The stash needs to survive the
    conflict-resolution session.
  - Stop the skill.
- On merge success, continue to step 4.

### 4. Auto-pop (only if we stashed)

If step 2 didn't stash, skip this step.

```
git stash pop
```

- On pop success: continue to step 5.
- On pop conflict:
  - Pause with:
    > Pop-conflict: the merged tree and your WIP overlap. Resolve
    > in your editor, then run `git stash drop` (or leave the stash
    > entry present until you sort it out). The merge itself is
    > done — you can safely continue other work while resolving.
  - Do NOT drop the stash automatically. If the user abandons the
    resolution, the WIP must still be recoverable.
  - Stop the skill.

### 5. Cleanup (ask)

Offer the destructive cleanup:

```
git worktree remove .worktrees/<id>
git branch -D agent/<id>
```

Ask before running. Default suggestion: yes. Skip if the user
declines (they may want to keep the branch around for a while).

### 6. Report

Tell the user:

- The merge commit hash + subject (from step 3's `git log -1
  --oneline`).
- Whether a WIP stash was created and popped (or is still around).
- Whether the worktree + agent branch were cleaned up.

## What this skill does NOT do

- **Archive the change.** That's `/ithy-opsx:archive`, which
  composes: commit worktree work → merge → openspec archive →
  commit. Use archive if you want the full history-cementing flow;
  use merge if you want to review the code first.
- **Push to remote.** That's a separate decision; the user pushes
  when ready.
- **Resolve merge conflicts.** The skill pauses; the user resolves.
- **Rewrite history.** No amends, no rebases. One merge, one commit
  (the `--no-ff` merge commit).

## When something goes wrong

- **`git commit` inside the merge fails because of a pre-commit
  hook.** Do NOT retry with `--no-verify`. Report the hook's output
  and stop. The stash from step 2 remains.
- **The user re-runs `/ithy-opsx:merge <id>` after a paused
  conflict.** Preflight re-runs from the top: check the branch,
  check identity, capture dirty state. If the tree is now dirty
  because they were mid-resolve, prompt them ("you have unresolved
  merge markers — finish resolving and commit the merge, then
  re-run"). Do not re-stash on top of a live merge.

## See also

- `.claude/skills/ithy-opsx-archive/SKILL.md` — full archive flow;
  shares the same "commit before proceeding" contract for worktree
  work, and can be thought of as a superset (merge + archive +
  commit).
- `docs/architecture/parallel-shells.md` — how worktrees + skills
  fit together in the dogfooding loop.
