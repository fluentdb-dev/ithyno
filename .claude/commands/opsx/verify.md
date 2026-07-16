---
name: "OPSX: Verify"
description: Run npm test / typecheck / build in fail-fast order and write review.md with the outcome
category: Workflow
tags: [workflow, verify, worker]
argument-hint: "<change-id>"
---

Verify that the current change's worktree passes the Node build chain
and write a structured verdict to `openspec/changes/<change-id>/review.md`.
When invoked by the Manager loop, the verdict drives the final
`reviewed → done` phase transition.

**Input**: `$ARGUMENTS` is the change id. The worktree at
`.worktrees/<change-id>/` must exist with the code worker's commit
landed.

**Node assumption**: This template targets Node projects that expose
`npm test`, `npm run typecheck`, and `npm run build`. Non-Node
projects need a different verify template — see
`docs/ideas/2026-07-08-verify-command-per-project.md`.

## Steps

1. **cd into the worktree**

   ```bash
   cd .worktrees/<change-id>
   ```

2. **Run the fail-fast chain via Bash**

   Execute in order, stop on first non-zero exit:

   ```bash
   npm test 2>&1
   ```

   Exit 0 → continue. Non-zero → capture last ~50 lines, skip to
   step 4 with `stage: test`.

   ```bash
   npm run typecheck 2>&1
   ```

   Same: continue on 0, capture and skip on non-zero with
   `stage: typecheck`.

   ```bash
   npm run build 2>&1
   ```

   Same: continue on 0, capture and skip on non-zero with
   `stage: build`.

3. **Success case — write pass verdict**

   All three exit 0. Write `openspec/changes/<change-id>/review.md`:

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

4. **Failure case — write needs-rework verdict**

   Write `openspec/changes/<change-id>/review.md`:

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

   The `message` contains the failing output verbatim so the Manager
   can pass it as prompt suffix to the next `/opsx:code` invocation.

5. **Report to the caller**

   `Wrote review.md — verify pass|failed(<stage>).`

## Guardrails

- **Do NOT modify code**. Verify is read-only.
- **Do NOT interpret partial failures**. Any command failing → whole
  verdict is `needs-rework`. Don't paper over failures by re-running
  or disabling tests.
- **Do NOT skip steps**. Fail-fast means STOP after the first failure,
  not skip past a failing test suite.
- **Do NOT touch phase or emit any dashboard events from here**. This
  is a pure verification worker; phase transitions are the Manager's
  decision.
- **Node assumption**: on non-Node projects (Python, Rust, ...) this
  template produces misleading results. Until per-project verify
  commands land, non-Node changes should NOT be verified via this
  template.
