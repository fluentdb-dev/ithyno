---
name: "OPSX: Code"
description: Code worker — implement the change's tasks in the worktree, incorporating review findings if provided
category: Workflow
tags: [workflow, code, worker, phase-4]
argument-hint: "<change-id>"
---

Implement outstanding tasks for the given change in its worktree. This
is the prompt template dispatched to a code-role agent via
`/opsx:dispatch code <change-id>`, typically from the Manager's loop.
The template preserves the "implement + commit on agent branch"
semantics of the legacy `ithy-opsx-apply` skill so existing users see
consistent behavior when Manager delegates to it.

**Input**: `$ARGUMENTS` is the change id.

**Manager-provided context** (present when dispatched via
`/opsx:dispatch code <id> --prompt-suffix="..."`): the `promptSuffix`
carries formatted review findings from a prior review iteration. When
present, prioritize fixing those findings over unfinished tasks.

## Steps

1. **Understand the change**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md` — the "why" and "what changes" of this proposal
   - `tasks.md` — the checkbox list of intended work; identify unfinished (`- [ ]`) items
   - `specs/**/*.md` — the ADDED / MODIFIED / REMOVED requirements
   - `design.md` (if present) — deeper rationale

   State in 2 sentences what the change is intended to accomplish.

2. **Apply Manager findings first (if any)**

   If the initial prompt includes review findings (a `promptSuffix`
   passed by Manager), each finding has a severity, file, line, and
   message. The findings look like:

   ```
   Prior review findings to address:
   - high server/foo.ts:42 — Off-by-one in the loop bound
   - medium web/src/bar.tsx:15 — Missing null check on props.value
   ```

   Fix these BEFORE continuing to unticked tasks. A pass-vs-needs-rework
   loop that keeps ignoring findings is the number-one reason the
   Manager loop hits its convergence cap.

3. **Implement outstanding tasks**

   For each unchecked item in `tasks.md`:
   - Make the code changes (Read/Edit/Write tools as usual)
   - Update the task checkbox: `- [ ] X.Y ...` → `- [x] X.Y ...`
   - Only tick a checkbox when the item is genuinely complete —
     don't tick to satisfy the loop.

   Follow the project's CLAUDE.md conventions (no emojis unless
   requested, don't add unnecessary comments, prefer edits over
   creations).

4. **Commit on the agent branch**

   Once the tasks are ticked and code compiles, create a single git
   commit describing the batch of work:

   ```bash
   git add <changed files>
   git commit -m "$(cat <<'EOF'
   impl: <change-id>

   <one paragraph summary of what changed>

   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
   EOF
   )"
   ```

   Do NOT push. The Manager (or user) decides when to merge.

5. **Report to the caller**

   Print:
   ```
   Coded <change-id>. Committed <hash>. N tasks ticked.
   ```

## When to escalate instead

Some situations mean the code worker CANNOT usefully commit and MUST
escalate. In each of these, invoke `/opsx:escalate <change-id>
"<reason>"` and exit WITHOUT committing:

- **Schema violation**: `proposal.md` frontmatter is malformed, or
  `specs/**/*.md` contains contradictory requirements.
- **Missing dependency**: implementation requires a package / tool that
  isn't installed AND cannot be installed without user consent.
- **Unsatisfiable requirement**: a spec asks for something that
  contradicts other landed spec (e.g. asks to add a field that a
  previous change removed) — the design needs human review.
- **Prior verify-failure loop**: if the promptSuffix reveals that this
  is the Nth failed retry on the same conceptual issue, escalate
  instead of guessing again.
- **Committing would break the branch**: the worktree already contains
  uncommitted changes from a previous run that would poison the diff.

## Guardrails

- **Do NOT commit partial or incorrect work**. A partial commit is
  worse than an escalation because the review verdict cascades into
  wasted iterations.
- **Do NOT modify `openspec/changes/<change-id>/proposal.md` or
  `specs/**/*.md`**. Those artifacts are the contract that the review
  worker measures against. If you believe they need changing, escalate
  — do not silently rewrite the contract.
- **Do NOT `--no-verify`** any pre-commit hooks. If a hook fails,
  address the failure or escalate.
- **Do NOT push**. Merging is the user's decision (or the Manager's
  post-verify step, in a future iteration).
- **Do NOT touch `.openspec.yaml`** or `phase` sidecar values from the
  code worker. Phase transitions are the Manager's job.
- **Do NOT read prior `review.md` yourself**. The Manager already
  parsed it and passed the relevant findings via `promptSuffix`;
  reading `review.md` again risks acting on stale content or a partial
  parse.

## Relationship to `ithy-opsx-apply`

`.claude/skills/ithy-opsx-apply/SKILL.md` (legacy Phase 1 skill) does
almost the same job. The differences:

- `ithy-opsx-apply` is invoked as `/ithy-opsx:apply` — the legacy
  default `claude` agent's initialInput.
- `/opsx:code` is invoked via `/opsx:dispatch code`, and receives a
  Manager-provided `promptSuffix`.
- Both commit on the agent branch. Both follow tasks.md checkboxes.

When `add-agents-yaml-migration` lands, the default `claude` agent
will point at `/opsx:manage` (Manager) instead of
`/ithy-opsx:apply`. From then on, code work happens via `/opsx:code`
dispatches. `ithy-opsx-apply` stays available for users who prefer
the pre-Manager one-shot flow.
