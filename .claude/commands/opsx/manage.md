---
name: "OPSX: Manage"
description: Manager loop — orchestrate code / review / verify workers for a change until phase reaches done
category: Workflow
tags: [workflow, manager, orchestrator]
argument-hint: "<change-id>"
---

Run the Manager orchestration loop for the given change. This is the
prompt a Claude Code session evaluates when the user types
`/opsx:manage <change-id>` (e.g., in the Terminal panel PTY).

The loop advances the change through `proposed → coded → reviewed →
done` by **invoking workers via the Task tool** (Claude Code
subagent), reading each verdict from the resulting `review.md`, and
updating the change's `phase` via `POST /api/changes/:id/phase`.

**Input**: `$ARGUMENTS` is the change id.

**Constants**:

- `MAX_ITERATIONS = 5` — the code ↔ review loop halts and escalates
  after this many attempts.
- `ITHYNO_BASE = http://localhost:4321` — adjust if the user's
  `ITHYNO_PORT` differs.

## Steps

1. **Read change context**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md`, `tasks.md`, `specs/**/*.md`, `.openspec.yaml`
   - Optional: `review.md`, `needs-human.md`

   Summarize the intent in 2 sentences before proceeding.

2. **Check current phase**

   ```bash
   curl -sS $ITHYNO_BASE/api/changes/<change-id>/phase
   ```

   Parse the response's `phase` field:
   - `done` → exit: `Change already at phase: done — nothing to do.`
   - `needs-human` → exit: `Change is in needs-human — user must
     answer via /opsx:answer <id> "<answer>" before Manager can
     proceed.`
   - `proposed` or `null` — enter loop from step 4 (code first)
   - `coded` — enter loop from step 5 (review first)
   - `reviewed` — skip to step 7 (verify)
   - unknown value → escalate: `Unknown phase '<value>'.`

3. **Ensure worktree exists**

   ```bash
   if [ ! -d ".worktrees/<change-id>" ]; then
     git worktree add .worktrees/<change-id> -b agent/<change-id>
   fi
   ```

   All subsequent worker invocations reference this path.

4. **Initialize loop state**

   ```
   iteration = 0
   priorFindings = ""   # empty on first iteration
   ```

5. **LOOP — code stage** (skip when phase is already `coded` or later)

   ```
   iteration += 1
   if iteration > MAX_ITERATIONS:
     /opsx:escalate <change-id> "Manager loop did not converge after MAX_ITERATIONS iterations. Latest review findings: <priorFindings>"
     exit
   ```

   Invoke the code worker via **Task tool** with:

   ```
   prompt: |
     /opsx:code <change-id>
     <priorFindings>
   ```

   (The Task tool spawns a subagent that runs the `/opsx:code` skill
   in the worktree, commits the impl, and returns.)

   After the Task returns:
   - If the subagent reported failure or timeout → escalate:
     `code worker failed on iteration <n>: <summary>`; exit.
   - If success → advance phase:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "coded"}'
     ```
     Log: `[manager] iteration <n>: code done, phase=coded`.

6. **LOOP — review stage**

   Invoke the review worker via **Task tool** with:

   ```
   prompt: /opsx:review <change-id>
   ```

   (The subagent runs `/opsx:review`, writes
   `openspec/changes/<change-id>/review.md`, and returns.)

   Read the review artifact:

   ```bash
   cat openspec/changes/<change-id>/review.md
   ```

   Parse the frontmatter's `verdict`:

   - `verdict: pass`:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "reviewed"}'
     ```
     Log: `[manager] iteration <n>: review pass, phase=reviewed`.
     Break out of the loop, proceed to step 7.

   - `verdict: needs-rework`:
     Format findings as prompt suffix for the next code iteration:
     ```
     priorFindings = "Prior review findings to address:\n" +
                     findings.map(f =>
                       `- ${f.severity} ${f.file || ""}:${f.line || ""} — ${f.message}`
                     ).join("\n")
     ```
     Log: `[manager] iteration <n>: review needs-rework (<count> findings), retrying code`.
     Continue loop (back to step 5).

   - Malformed or missing verdict:
     Escalate: `Review returned no verdict on iteration <n>.`; exit.

7. **Verify stage**

   Invoke the verify worker via **Task tool** with:

   ```
   prompt: /opsx:verify <change-id>
   ```

   Read the updated review artifact:

   ```bash
   cat openspec/changes/<change-id>/review.md
   ```

   Parse the `verdict`:

   - `verdict: pass`:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "done"}'
     ```
     Report:
     ```
     Manager loop complete for <change-id>.
     Phase: done. <n> code/review iterations.
     Ready for /ithy-opsx:archive.
     ```
     Exit.

   - `verdict: needs-rework`:
     Escalate: `Verify failed: <summary>` (include findings so the
     user sees which command failed); exit.

   - missing:
     Escalate: `Verify returned no verdict.`; exit.

## Guardrails

- **Convergence guard**: MAX_ITERATIONS is a hard ceiling. Do NOT
  bypass it. If a change is stuck at needs-rework after 5 iterations,
  human input is required. Silently raising the cap wastes tokens and
  hides real problems.

- **One phase update per stage**: only call `POST /api/changes/:id/phase`
  after the corresponding worker returned success AND the review
  (for reviewed) or verify (for done) verdict is `pass`. Do NOT set
  `phase: needs-human` from the Manager — that's `/opsx:escalate`'s
  job.

- **Do NOT modify code from the Manager session**. All code changes
  happen inside Task tool subagent invocations. If the Manager needs
  to investigate, use Read-only tools. Modifying files from here
  breaks the audit trail.

- **Do NOT retry a failed worker without changing input**. If a code
  Task returned failure on the same `priorFindings` twice in a row,
  escalate — don't loop on the same failure.

- **Do NOT skip the phase check in step 2**. Re-entering the Manager
  on a change that's `done` or `needs-human` MUST be a no-op.

- **Escalation is Manager's last resort, not first**. Only escalate
  when the loop cannot make progress: worker failure, missing
  verdict, or convergence cap. A single needs-rework verdict is NOT
  an escalation trigger.

- **Restart recovery**: when the Manager is invoked a second time on
  the same change (e.g., because the PTY session died), the phase
  check in step 2 does the right thing automatically. A change at
  `coded` skips to review; at `reviewed` skips to verify.

## Follow-ups (not this file)

- Per-project `manager.maxIterations` field in `agents.yaml`
  (`docs/ideas/2026-07-11-manager-max-iterations-config.md`).
- Per-project verify command
  (`docs/ideas/2026-07-11-verify-command-per-project.md`).
- agmsg-based dispatch as an alternative to Task tool (see
  `docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md` and
  the parked `docs/ideas/2026-07-06-cross-agent-messaging.md`).
