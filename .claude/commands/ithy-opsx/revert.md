---
name: "ITHY-OPSX: Revert"
description: Open a Case α or Case β revert change with PENDING / REVERTED annotations enforced by tooling
category: Workflow
tags: [workflow, revert, artifacts, experimental]
---

Open a revert change under the `revert-<scope>` naming convention.

I'll:
- Ask which target requirement(s) you want to revert
- Classify each as Case α (target archived — MODIFIED / REMOVED delta)
  or Case β (target still in-flight — ADDED delta + reverted-target archive)
- Create the change scaffold
- Auto-insert **PENDING** annotations into the current spec (closes the
  propose→archive misreading gap for MODIFIED / REMOVED requirements)
- Auto-insert **REVERTED** annotations into Case α archived proposals
- Validate the resulting change

When ready to implement the revert, run `/opsx:apply revert-<scope>`.

---

**Input**: The argument after `/ithy-opsx:revert` is the revert scope in
kebab-case (e.g., `kanban-ui-lanes` → change id `revert-kanban-ui-lanes`),
OR a description that I'll convert to kebab-case.

**How to run this**

Follow the **`ithy-opsx-revert`** skill (see `.claude/skills/ithy-opsx-revert/SKILL.md`) with
scope: **$ARGUMENTS**.

The skill covers:

1. **Preflight** — repo clean, git identity set, `openspec` CLI available.
2. **Scope handling** — argument-supplied or interactive prompt; kebab-case validation.
3. **Target collection** — list active + landed requirements, let user pick one or more.
4. **Case classification** — Case α (archived) vs Case β (in-flight) per target.
5. **Scaffold** — `openspec new change revert-<scope>` + populate `proposal.md`
   (Why + Targets), delta `specs/<capability>/spec.md` (REMOVED / MODIFIED / ADDED),
   `tasks.md` (standard revert checklist).
6. **PENDING annotation** — inserted directly under each targeted `### Requirement:`
   heading in the current `openspec/specs/<capability>/spec.md`.
7. **REVERTED annotation (Case α)** — blockquote at the top of each archived target's
   `proposal.md`, immediately after the closing frontmatter delimiter.
8. **Reverted-target archive (Case β)** — target's `outcome.md` rewritten,
   `specs/` deleted, `openspec archive <target-id>` invoked.
9. **Validate** — `openspec validate revert-<scope>` and report.

Do not skip steps. Never `git commit`, `openspec archive`, or make
destructive git changes as part of this command — the revert change goes
through the standard `/opsx:apply` → `/ithy-opsx:archive` flow after.
