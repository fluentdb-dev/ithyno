---
name: "ITHY-OPSX: Apply"
description: Implement an OpenSpec change and end by committing the work on the current branch (Claude follows the ithy-opsx-apply skill, which wraps /opsx:apply and adds a commit step)
category: Workflow
tags: [workflow, apply, git, ithy-opsx]
---

Implement an OpenSpec change and commit the result on the current
branch.

**Input**: Optionally specify a change name after `/ithy-opsx:apply`
(e.g., `/ithy-opsx:apply add-auth`). If omitted, check whether it can
be inferred from conversation context; if vague or ambiguous, prompt
for the available changes.

**How to run this**

Follow the **`ithy-opsx-apply`** skill (see
`.claude/skills/ithy-opsx-apply/SKILL.md`) for change: **$ARGUMENTS**.

The skill covers:

1. **Preflight** — change exists, tasks.md exists, git identity is set.
2. **Delegate to `/opsx:apply <id>`** — reuse the upstream apply flow.
3. **Porcelain check** — is the tree dirty after apply?
4. **Commit (if dirty)** — draft an `agent: implement <id>` message,
   get user approval, run `git commit`.
5. **Report** — commit hash or "clean tree, nothing to commit."

Do not skip the commit step when the tree is dirty. Never `--no-verify`
a failed pre-commit hook.
