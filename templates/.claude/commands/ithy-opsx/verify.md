---
name: "ITHY-OPSX: Verify"
description: Run available npm verification scripts in fail-fast order and write review.md with the outcome
category: Workflow
tags: [workflow, verify, worker, ithy-opsx]
argument-hint: "<change-id>"
---

Verify that the current change's worktree passes its available Node checks
and write a structured verdict to `openspec/changes/<change-id>/review.md`.
When invoked by the dispatcher (`/ithy-opsx:dispatch`), the verdict
drives the final `reviewed → done` phase transition.

**Input**: `$ARGUMENTS` is the change id. The worktree at
`.worktrees/<change-id>/` must exist with the code worker's commit
landed.

**Node assumption**: This fallback understands the conventional `test`,
`typecheck`, and `build` scripts in `package.json`. A missing script is
`not-applicable`, not a command failure, unless the change's proposal,
tasks, or specs explicitly require that check. Non-Node projects still
need a project-specific verify template — see
`docs/ideas/2026-07-08-verify-command-per-project.md`.

## Steps

1. **cd into the worktree**

   ```bash
   cd .worktrees/<change-id>
   ```

2. **Discover applicable checks before running them**

   Read `package.json` and inspect its `scripts` object. Consider the
   checks in this order: `test`, `typecheck`, `build`.

   - A defined script is `applicable` and MUST be run.
   - An undefined script is `not-applicable` and MUST NOT be invoked.
   - Before skipping it, read the change's proposal, tasks, and specs.
     If they explicitly require that check, the missing script is an
     unmet verification requirement and the verdict is `needs-rework`.

   A safe discovery command is:

   ```bash
   node -e 'const s=require("./package.json").scripts||{}; for (const n of ["test","typecheck","build"]) console.log(`${n}:${Object.hasOwn(s,n)?"run":"not-applicable"}`)'
   ```

3. **Run applicable checks via Bash**

   Execute only scripts reported as `run`, in order, and stop on the
   first non-zero exit:

   ```bash
   npm test 2>&1
   ```

   Exit 0 → continue. Non-zero → capture last ~50 lines, skip to
   step 5 with `stage: test`.

   ```bash
   npm run typecheck 2>&1
   ```

   Run only when defined. Continue on 0; capture and skip to step 5 on
   non-zero with `stage: typecheck`.

   ```bash
   npm run build 2>&1
   ```

   Run only when defined. Continue on 0; capture and skip to step 5 on
   non-zero with `stage: build`.

4. **Success case — write pass verdict**

   Every applicable check exited 0 and no explicitly required check is
   missing. Write `openspec/changes/<change-id>/review.md`:

   ```markdown
   ---
   verdict: pass
   summary: "verify pass"
   findings: []
   ---

   ## Results

   Verification checks:
   - `npm test` — <N> tests
   - `npm run typecheck` — not-applicable (script not defined)
   - `npm run build` — not-applicable (script not defined)
   ```

   Include one line for every candidate check with its actual result.
   If no scripts are applicable, state `No automated npm checks were
   applicable`; this may still be `pass` only when the change does not
   require a missing verification command.

5. **Failure case — write needs-rework verdict**

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

   The `message` contains the failing output verbatim so the dispatcher
   can pass it as prompt suffix to the next `/opsx:apply` invocation.

6. **Report to the caller**

   `Wrote review.md — verify pass|failed(<stage>).`

## Guardrails

- **Do NOT modify code**. Verify is read-only.
- **Do NOT interpret partial failures**. Any command failing → whole
  verdict is `needs-rework`. Don't paper over failures by re-running
  or disabling tests.
- **Do NOT skip applicable checks**. Fail-fast means STOP after the first
  failing defined script. Missing scripts are explicitly recorded as
  `not-applicable`; they are not silently ignored.
- **Do NOT touch phase or emit any dashboard events from here**. This
  is a pure verification worker; phase transitions are the dispatcher's
  decision.
- **`review.md` is the sole contract**. The dispatcher parses only
  the artifact frontmatter — stdout is ignored. Write the verdict
  to the file, not to stdout.
- **Do NOT invent success for unmet requirements**. If proposal, tasks,
  or specs require a check that cannot be run, write `needs-rework` and
  identify the missing verification command.
- **Node assumption**: on non-Node projects (Python, Rust, ...) use the
  project's own verification instructions rather than treating absent
  npm scripts as evidence that the implementation works.
