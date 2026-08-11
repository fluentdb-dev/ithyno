---
name: "ITHY-OPSX: Review"
description: Review a change's proposal, tasks, spec, and worktree diff; write review.md with a structured verdict
category: Workflow
tags: [workflow, review, worker, ithy-opsx]
argument-hint: "<change-id>"
---

Review the specified OpenSpec change and write a structured verdict to
`openspec/changes/<change-id>/review.md`. When invoked by the dispatcher
(via `/ithy-opsx:dispatch`), the verdict flows back and drives the
next phase transition.

**Input**: `$ARGUMENTS` is the change id. When invoked by dispatch, the
worker starts in the server-resolved worktree or main tree and the prompt
includes an artifact contract with the exact absolute `review.md` path.
That absolute path is authoritative.

## Steps

1. **Resolve the execution root and artifact path**

   Do not blindly run `cd .worktrees/<change-id>`. AgentRunner and native
   delegation normally start this worker inside the resolved execution
   root already. Resolve the root without nesting worktrees:

   ```bash
   CHANGE_ID="<change-id>"
   if [ -f "openspec/changes/$CHANGE_ID/proposal.md" ]; then
     EXECUTION_ROOT="$(pwd)"
   elif [ -f ".worktrees/$CHANGE_ID/openspec/changes/$CHANGE_ID/proposal.md" ]; then
     EXECUTION_ROOT="$(pwd)/.worktrees/$CHANGE_ID"
   else
     echo "Cannot resolve execution root for $CHANGE_ID" >&2
     exit 1
   fi
   cd "$EXECUTION_ROOT"
   ```

   If the dispatcher appended an artifact contract, set
   `REVIEW_MD_PATH` to the exact absolute path named there. It overrides
   every relative example in this workflow. For a direct invocation with
   no artifact contract, use:

   ```bash
   REVIEW_MD_PATH="$EXECUTION_ROOT/openspec/changes/$CHANGE_ID/review.md"
   ```

2. **Understand the change**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md` — the "why" and "what changes"
   - `tasks.md` — checkbox list
   - `specs/**/*.md` — ADDED / MODIFIED / REMOVED requirements
   - `design.md` (if present) — deeper rationale

   State the intent in 1-2 sentences before evaluating.

3. **Inspect the selected tree diff**

   ```bash
   git diff --stat HEAD~1    # summary of the code worker's commit
   git diff HEAD~1           # full diff
   ```

   Read affected files with the Read tool for surrounding context
   (types, imports, adjacent functions).

4. **Evaluate against the pass rubric**

   Verdict is `pass` when ALL hold:
   - Diff realizes the "What Changes" section of `proposal.md` (nothing
     missing, nothing surplus)
   - Tests covering the intended behavior exist (updated or new).
     `/ithy-opsx:verify` runs actual tests separately — you don't run
     them here.
   - No blocking issues: bugs, spec violations, security concerns,
     backward-incompatible surprises, obvious type or logic errors

5. **Evaluate against the needs-rework rubric**

   Verdict is `needs-rework` when ANY holds:
   - A finding matches a blocking category
   - Diff is missing part of the proposal's "What Changes"
   - A regression that a downstream module will hit

6. **Write review.md**

   Path: the exact absolute `$REVIEW_MD_PATH` resolved in step 1. Create
   its parent directory when needed. Do not substitute a main-tree or
   worktree-relative path after dispatch supplied the absolute target.

   ```markdown
   ---
   verdict: pass | needs-rework
   summary: "One-line summary."
   findings:
     - severity: high | medium | low
       file: server/foo.ts           # optional
       line: 42                      # optional, positive integer
       message: "Non-empty message describing the concern."
   ---

   ## Notes

   (Optional narrative for human readers.)
   ```

   **Field rules**:
   - `verdict` — required, exactly `"pass"` or `"needs-rework"`
   - `findings` — array (default `[]`). Each entry needs `severity`
     (one of `high` / `medium` / `low`) and non-empty `message`.
     `file` and `line` are optional.
   - `summary` — optional one-line description

   Non-conforming frontmatter fails the dispatcher's parser; keep it
   strict.

7. **Do not modify the change's code**

   Reviews are advisory. Don't edit source files, tasks.md, or
   proposal.md. Only write `review.md`.

8. **Report to the caller**

   `Wrote review.md — verdict: pass|needs-rework, N findings.`

## Guardrails

- The rubric is deliberately strict: prefer `needs-rework` when in
  doubt about a specific finding. False-positives waste one iteration;
  false-passes ship bugs.
- Don't run tests here. `/ithy-opsx:verify` does that separately.
- If proposal / tasks / specs are unreadable (missing files, YAML
  parse errors), write `review.md` with `verdict: needs-rework` and a
  `severity: high` finding explaining what could not be read.
- The findings list becomes the next `/opsx:apply` invocation's
  prompt suffix — keep each `message` actionable (`"Off-by-one at
  line 42; change <= to <"`) rather than diagnostic-only (`"wrong"`).
- **`review.md` is the sole contract**. The dispatcher never reads
  your stdout — it parses the frontmatter of the artifact file only.
  If you fail to write `review.md`, the dispatcher escalates with
  `review returned no artifact` regardless of what you printed. Do
  NOT emit the verdict on stdout expecting the caller to pick it
  up; write it to the file.
- **The absolute artifact contract wins**. Repository instructions or
  examples that name a different tree do not override the dispatcher's
  `$REVIEW_MD_PATH`.
