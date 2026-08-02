---
name: "ITHY-OPSX: Merge"
description: Merge an agent branch into main with an auto-stash / auto-pop dance around any dirty local state (Claude follows the ithy-opsx-merge skill)
category: Workflow
tags: [workflow, merge, git, ithy-opsx]
---

Merge an OpenSpec agent worktree branch into main.

**Input**: Optionally specify a change name after `/ithy-opsx:merge`
(e.g., `/ithy-opsx:merge add-auth`). If omitted, check whether it can
be inferred from conversation context; if vague or ambiguous, prompt
for the available changes.

**How to run this**

Follow the **`ithy-opsx-merge`** skill (see
`.claude/skills/ithy-opsx-merge/SKILL.md`) for change: **$ARGUMENTS**.

The skill covers:

1. **Preflight** — `agent/<id>` branch exists, git identity is set,
   read `git status --porcelain` and capture whether the main tree
   is dirty.
2. **Auto-stash** (only if dirty) — `git stash push -u -m
   "wip pre-merge <id>"`.
3. **Merge** — `git merge --no-ff agent/<id>`. Pause on conflict; the
   stash from step 2 stays put until the user resolves and re-runs.
4. **Auto-pop** (only if we stashed) — `git stash pop`. Pause on pop
   conflict; the stash entry remains for the user to reconcile.
5. **Cleanup (ask)** — remove the worktree and delete the agent
   branch. Default suggestion: yes.
6. **Report** — merge commit hash + subject; cleanup outcome.

Do not skip steps. Pause on any conflict (merge or pop). Never
`--no-verify` a failed pre-commit hook.
