---
name: "OPSX: Review"
description: Review a change's proposal, tasks, spec, and worktree diff; write review.md with a structured verdict
category: Workflow
tags: [workflow, review, worker, phase-4]
argument-hint: "<change-id>"
---

Review the specified OpenSpec change and write a structured verdict to
`openspec/changes/<change-id>/review.md`. This slash command is the
prompt template dispatched to a review-role agent via `/opsx:dispatch
review <change-id>`. The written artifact is parsed by Ithyno and its
`verdict.verdict` field flows back to the Manager (Phase 4.2) so the
Manager can advance the phase or trigger a rework loop.

**Input**: `$ARGUMENTS` is the change id.

## Steps

1. **Understand the change**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md` — the "why" and "what changes" of this proposal
   - `tasks.md` — the checkbox list of intended work
   - `specs/**/*.md` — the ADDED / MODIFIED / REMOVED requirements
   - `design.md` (if present) — deeper rationale

   State what the change is intended to accomplish in 1-2 sentences
   before evaluating anything.

2. **Inspect the worktree diff**

   The Ithyno runner has already checked out the agent branch in a
   worktree pool slot. Use the Bash tool to run:

   ```bash
   git diff --stat HEAD    # summary
   git diff HEAD           # full diff
   ```

   Read all changed files with the Read tool to get context that
   the diff alone doesn't reveal (surrounding functions, type
   definitions, imports).

3. **Evaluate against the pass rubric**

   The change earns `verdict: pass` when ALL of the following hold:
   - The diff realizes the "What Changes" section of `proposal.md`
     (nothing missing, nothing surplus)
   - Tests that would catch the change's intended behavior exist
     (either updated existing tests or new tests). Note: `verify`
     runs separately; you do NOT need to run tests here.
   - No blocking issues: bugs, spec violations, security concerns,
     backward-incompatible surprises, obvious type or logic errors

4. **Evaluate against the needs-rework rubric**

   The change earns `verdict: needs-rework` when ANY of the following
   holds:
   - A finding matches one of the blocking issue categories above
   - The diff is missing part of the proposal's "What Changes"
   - A change introduces a regression that a downstream module (or
     already-shipped feature) will hit

5. **Write review.md**

   Path: `openspec/changes/<change-id>/review.md`

   Use frontmatter YAML that matches the schema landed by
   `add-review-artifact`. Example structure:

   ```markdown
   ---
   verdict: pass | needs-rework
   summary: "One-line summary — used in the Agents tab live view."
   findings:
     - severity: high | medium | low
       file: server/foo.ts           # optional
       line: 42                      # optional, positive integer
       message: "Non-empty message describing the concern."
   ---

   ## Notes

   (Optional narrative for humans reading the artifact directly.)
   ```

   **Field rules**:
   - `verdict` — required, exactly `"pass"` or `"needs-rework"`
   - `findings` — array (default `[]`). Each entry needs
     `severity` (one of `high` / `medium` / `low`) and a non-empty
     `message`. `file` and `line` are optional.
   - `summary` — optional one-line description; used as the
     display string in the Agents tab and in Manager logs.

   Non-conforming frontmatter will fail Ithyno's parser and the
   Manager will treat the review as no verdict (worst case for the
   pipeline).

6. **Do not modify the change's code**

   Reviews are advisory. Do not edit source files, tasks.md, or
   proposal.md. Only write `review.md`.

7. **Report to the caller**

   After writing, print a 1-line confirmation:
   `Wrote review.md — verdict: pass|needs-rework, N findings.`

## Guardrails

- The verdict rubric is deliberately strict: prefer `needs-rework` when
  in doubt about a specific finding. False-positives waste one dispatch
  cycle; false-passes ship bugs.
- Do not run tests here. `/opsx:verify` does that separately in the
  Manager loop.
- If the proposal / tasks / specs are unreadable (missing files, YAML
  parse errors), write `review.md` with `verdict: needs-rework` and a
  finding of severity `high` explaining what could not be read.
- The findings list is consumed by the Manager as `prompt_suffix`
  material for the next `code` dispatch — keep each `message`
  actionable ("Off-by-one in the loop bound at line 42; change `<=` to
  `<`") rather than diagnostic-only ("wrong").
