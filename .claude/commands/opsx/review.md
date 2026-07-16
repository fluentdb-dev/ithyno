---
name: "OPSX: Review"
description: Review a change's proposal, tasks, spec, and worktree diff; write review.md with a structured verdict
category: Workflow
tags: [workflow, review, worker]
argument-hint: "<change-id>"
---

Review the specified OpenSpec change and write a structured verdict to
`openspec/changes/<change-id>/review.md`. When invoked by the Manager
loop (via `/opsx:manage`), the verdict flows back and drives the
next phase transition.

**Input**: `$ARGUMENTS` is the change id. The worktree at
`.worktrees/<change-id>/` (branch `agent/<change-id>`) is assumed to
exist with the code worker's commit already landed.

## Steps

1. **Understand the change**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md` — the "why" and "what changes"
   - `tasks.md` — checkbox list
   - `specs/**/*.md` — ADDED / MODIFIED / REMOVED requirements
   - `design.md` (if present) — deeper rationale

   State the intent in 1-2 sentences before evaluating.

2. **Inspect the worktree diff**

   ```bash
   cd .worktrees/<change-id>
   git diff --stat HEAD~1    # summary of the code worker's commit
   git diff HEAD~1           # full diff
   ```

   Read affected files with the Read tool for surrounding context
   (types, imports, adjacent functions).

3. **Evaluate against the pass rubric**

   Verdict is `pass` when ALL hold:
   - Diff realizes the "What Changes" section of `proposal.md` (nothing
     missing, nothing surplus)
   - Tests covering the intended behavior exist (updated or new).
     `/opsx:verify` runs actual tests separately — you don't run them
     here.
   - No blocking issues: bugs, spec violations, security concerns,
     backward-incompatible surprises, obvious type or logic errors

4. **Evaluate against the needs-rework rubric**

   Verdict is `needs-rework` when ANY holds:
   - A finding matches a blocking category
   - Diff is missing part of the proposal's "What Changes"
   - A regression that a downstream module will hit

5. **Write review.md**

   Path: `openspec/changes/<change-id>/review.md`

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

   Non-conforming frontmatter fails the Manager's parser; keep it
   strict.

6. **Do not modify the change's code**

   Reviews are advisory. Don't edit source files, tasks.md, or
   proposal.md. Only write `review.md`.

7. **Report to the caller**

   `Wrote review.md — verdict: pass|needs-rework, N findings.`

## Guardrails

- The rubric is deliberately strict: prefer `needs-rework` when in
  doubt about a specific finding. False-positives waste one iteration;
  false-passes ship bugs.
- Don't run tests here. `/opsx:verify` does that separately.
- If proposal / tasks / specs are unreadable (missing files, YAML
  parse errors), write `review.md` with `verdict: needs-rework` and a
  `severity: high` finding explaining what could not be read.
- The findings list becomes the next `/opsx:code` invocation's
  prompt suffix — keep each `message` actionable (`"Off-by-one at
  line 42; change <= to <"`) rather than diagnostic-only (`"wrong"`).
