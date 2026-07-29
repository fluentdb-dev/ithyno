---
name: "ITHY-OPSX: Archive"
description: Archive an OpenSpec change and commit the result in one gesture (Claude follows the ithy-opsx-archive skill)
category: Workflow
tags: [workflow, archive, git, ithy-opsx]
---

Archive an OpenSpec change as a single git commit.

**Input**: Optionally specify a change name after `/ithy-opsx:archive`
(e.g., `/ithy-opsx:archive add-auth`). If omitted, check whether it can
be inferred from conversation context; if vague or ambiguous, prompt
for the available changes.

**How to run this**

Follow the **`ithy-opsx-archive`** skill (see
`.claude/skills/ithy-opsx-archive/SKILL.md`) for change: **$ARGUMENTS**.

The skill covers:

1. **Preflight** — change exists, tasks done, outcome written.
2. **Optional worktree merge** — `git merge --no-ff agent/<id>` if a
   worktree branch exists.
3. **Archive** — delegate to `openspec archive <id>`.
4. **Commit** — draft a message (`archive: <id>` + summary + tags), get
   the user's approval, run `git commit`.
5. **Cleanup (ask)** — remove the worktree and delete the agent branch.
6. **Report** — new archive path + commit hash.

Do not skip steps. Pause on merge conflicts. Never `--no-verify` a
failed pre-commit hook.
