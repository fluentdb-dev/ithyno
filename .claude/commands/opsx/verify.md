---
name: "OPSX: Verify"
description: Run npm test / typecheck / build in fail-fast order and write review.md with the outcome
category: Workflow
tags: [workflow, verify, worker, phase-4]
argument-hint: "<change-id>"
---

Verify that the current change's worktree passes the Node build chain
and write a structured verdict to `openspec/changes/<change-id>/review.md`.
This slash command is the prompt template dispatched to a verify-role
agent via `/opsx:dispatch verify <change-id>`. Manager reads the
resulting `verdict.verdict` field to decide whether to advance the
phase from `reviewed` to `done`.

**Input**: `$ARGUMENTS` is the change id.

**Assumption (Fable review MEDIUM #6)**: This template targets Node
projects that expose `npm test`, `npm run typecheck`, and
`npm run build`. Non-Node projects need a different verify template.
The follow-up idea note `docs/ideas/2026-07-08-verify-command-per-project.md`
tracks a per-project `agents.yaml` field.

## Steps

1. **Run the fail-fast chain via Bash**

   Execute in order, stop on first non-zero exit:

   ```bash
   npm test 2>&1
   ```

   If exit code is 0, continue. Otherwise, capture the last ~50 lines
   of output and skip to step 3 with `stage: test`.

   ```bash
   npm run typecheck 2>&1
   ```

   Same: continue on 0, capture and skip on non-zero with
   `stage: typecheck`.

   ```bash
   npm run build 2>&1
   ```

   Same: continue on 0, capture and skip on non-zero with `stage: build`.

2. **Success case — write pass verdict**

   If all three commands returned exit code 0, write
   `openspec/changes/<change-id>/review.md` with:

   ```markdown
   ---
   verdict: pass
   summary: "verify pass"
   findings: []
   ---

   ## Results

   All checks passed:
   - `npm test` — <N> tests
   - `npm run typecheck` — clean
   - `npm run build` — clean
   ```

3. **Failure case — write needs-rework verdict**

   Write `openspec/changes/<change-id>/review.md` with:

   ```markdown
   ---
   verdict: needs-rework
   summary: "verify failed at <stage>"
   findings:
     - severity: high
       message: "<last ~50 lines of the failing command's output>"
   ---

   ## Failing command

   `<the exact command that failed>` exited with code <N>.

   ```
   <full captured output, up to ~100 lines>
   ```
   ```

   The `message` inside findings SHALL contain the failing command's
   error output verbatim so the Manager can pass it as
   `prompt_suffix` to the next `code` dispatch.

4. **Report to the caller**

   Print `Wrote review.md — verify pass|failed(<stage>).`

## Guardrails

- **Do NOT modify code**. Verify is read-only for the change.
- **Do NOT interpret partial failures**. If any command fails, the
  whole verify verdict is `needs-rework`. Do not paper over one failure
  by re-running or by disabling test cases.
- **Do NOT skip steps**. Fail-fast means STOP after the first failure,
  not skip forward past a failing test suite.
- **Do NOT invoke Manager or Ithyno endpoints from here**. Verify is a
  pure verification worker; the phase transition is Manager's decision.
- **Node assumption**: this template will produce misleading results on
  non-Node projects (e.g. Python, Rust). Until per-project verify
  commands land, a Rust project should NOT dispatch verify.
