---
name: "OPSX: Code"
description: Code worker — implement the change's tasks in the worktree, incorporating review findings if provided
category: Workflow
tags: [workflow, code, worker]
argument-hint: "<change-id>"
---

Implement outstanding tasks for the given change in its worktree.

**Input**: `$ARGUMENTS` is the change id. The worktree at
`.worktrees/<change-id>/` (branch `agent/<change-id>`) is assumed to
already exist — the caller (Manager loop or user) has created it via
`git worktree add`.

**Optional review findings**: If the caller passes prior review
findings as additional context in the prompt (e.g.,
`Prior review findings: - high server/foo.ts:42 — Off-by-one`),
prioritize fixing those over unfinished tasks.

## Steps

1. **Understand the change**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md` — the "why" and "what changes"
   - `tasks.md` — checkbox list; identify unfinished (`- [ ]`) items
   - `specs/**/*.md` — ADDED / MODIFIED / REMOVED requirements
   - `design.md` (if present) — deeper rationale

   State in 2 sentences what the change is intended to accomplish.

2. **cd into the worktree**

   ```bash
   cd .worktrees/<change-id>
   ```

   All subsequent Read/Edit/Write/Bash operations happen inside the
   worktree so the changes land on `agent/<change-id>` branch.

3. **Apply review findings first (if any)**

   If the initial prompt includes review findings, fix them BEFORE
   unchecked tasks. Each finding names a file/line and a concern:
   address it and re-verify by reading the surrounding code.

4. **Implement outstanding tasks**

   For each unchecked item in `tasks.md`:
   - Make code changes (Read/Edit/Write)
   - Update the checkbox: `- [ ] X.Y ...` → `- [x] X.Y ...`
   - Only tick when the item is genuinely complete

   Follow the project's CLAUDE.md conventions.

5. **Commit on the agent branch**

   Once code compiles and tasks are ticked, create one commit:

   ```bash
   git add <changed files>
   git commit -m "$(cat <<'EOF'
   impl: <change-id>

   <one paragraph summary of what changed>

   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
   EOF
   )"
   ```

   Do NOT push. The user (or Manager) decides when to merge.

6. **Report to the caller**

   Print:
   ```
   Coded <change-id>. Committed <hash>. N tasks ticked.
   ```

## When to escalate instead

Some situations mean the code worker CANNOT usefully commit and MUST
escalate. Invoke `/opsx:escalate <change-id> "<reason>"` and exit
WITHOUT committing:

- **Schema violation**: `proposal.md` frontmatter malformed, or
  contradictory requirements across `specs/**/*.md`.
- **Missing dependency**: implementation needs a package / tool that
  isn't installed AND can't be installed without user consent.
- **Unsatisfiable requirement**: a spec asks for something that
  contradicts other landed spec (e.g., add a field a previous change
  removed) — the design needs human review.
- **Uncommitted state pollution**: the worktree already contains
  uncommitted changes from a previous run that would poison the diff.

## Guardrails

- **Do NOT commit partial or incorrect work**. Partial commits waste
  Manager iterations more than clean escalations do.
- **Do NOT modify `openspec/changes/<change-id>/proposal.md` or
  `specs/**/*.md`**. Those are the contract review measures against.
  If they need changing, escalate.
- **Do NOT `--no-verify`** any pre-commit hooks. Fix the failure or
  escalate.
- **Do NOT push**. Merging is the user's decision.
- **Do NOT touch `.openspec.yaml`** or `phase` sidecar values.
  Phase transitions are the Manager's / user's job.

## Relationship to `ithy-opsx-apply`

`.claude/skills/ithy-opsx-apply/SKILL.md` does almost the same job.
Differences:

- `/ithy-opsx:apply <id>` is the standalone user entry point (no
  Manager loop context).
- `/opsx:code <id>` is invoked by the Manager loop via Task tool
  (or manually), and may receive review findings in the prompt.
- Both commit on the agent branch, both follow `tasks.md` checkboxes.
