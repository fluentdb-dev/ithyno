---
name: "OPSX: Manage"
description: Manager loop — dispatch code / review / verify workers for a change until phase reaches done
category: Workflow
tags: [workflow, manager, orchestrator, phase-4]
argument-hint: "<change-id>"
---

Run the Manager orchestration loop for the given change. This is the
prompt that a Claude Code session evaluates when the user clicks
Kanban's [Apply] (after `add-agents-yaml-migration` swaps the default
agent's initialInput) or when the user types `/opsx:manage <change-id>`
manually in a PTY.

The loop advances the change through phase transitions
`proposed → coded → reviewed → done` by dispatching worker agents via
`POST /api/agents/dispatch`, reading the returned `verdict`, and
updating the change's `phase` via `POST /api/changes/:id/phase`.

**Input**: `$ARGUMENTS` is the change id.

**Constants** (hard-coded — see the follow-up idea note for a future
`agents.yaml manager.maxIterations` field):

- `MAX_ITERATIONS = 5` — the code ↔ review loop halts after this many
  attempts and escalates.
- `DISPATCH_TIMEOUT_MS = 1800000` (30 min) — passed to each dispatch.
- `ITHYNO_BASE = http://localhost:4321` — adjust if the user's
  `ITHYNO_PORT` differs.

## Steps

1. **Read change context**

   Read every file under `openspec/changes/<change-id>/`:
   - `proposal.md`, `tasks.md`, `specs/**/*.md`, `.openspec.yaml`
   - Optional: `review.md`, `needs-human.md` if they exist

   Summarize the change's intent in 2 sentences before proceeding.

2. **Check current phase**

   ```bash
   curl -sS $ITHYNO_BASE/api/changes/<change-id>/phase
   ```

   Parse the response's `phase` field:
   - `done` — exit immediately, report `Change already at phase: done — nothing to do.`
   - `needs-human` — exit immediately, report `Change is in needs-human — answer required before Manager can proceed. Use /opsx:answer <id> "<answer>" once the user resolves the escalation.`
   - `proposed` or `null` (missing) — enter the loop from step 4 (code first)
   - `coded` — enter the loop from step 5 (review first)
   - `reviewed` — skip to step 7 (verify)
   - unknown value — escalate with `Unknown phase '<value>' — cannot proceed.`

3. **Initialize loop state**

   ```
   iteration = 0
   priorFindings = ""   # empty on first iteration
   ```

4. **LOOP — code stage** (skip when phase is already `coded` or later)

   ```
   iteration += 1
   if iteration > MAX_ITERATIONS:
     Escalate:
       /opsx:escalate <change-id> "Manager loop did not converge after MAX_ITERATIONS iterations. Latest review findings: <priorFindings>"
     Exit.
   ```

   Dispatch the code worker:

   ```bash
   curl -sS -X POST $ITHYNO_BASE/api/agents/dispatch \
     -H 'content-type: application/json' \
     -d '{
       "role": "code",
       "changeId": "<change-id>",
       "promptSuffix": "<priorFindings>",
       "wait": true,
       "timeoutMs": 1800000
     }'
   ```

   Parse the response:
   - `status != "completed"` → escalate with reason
     `code worker failed on iteration <n>: <stdoutTail excerpt>` and
     exit.
   - `status == "completed"` — advance phase:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "coded"}'
     ```
     Log: `[manager] iteration <n>: code done, phase=coded`.

5. **LOOP — review stage**

   Dispatch the review worker:

   ```bash
   curl -sS -X POST $ITHYNO_BASE/api/agents/dispatch \
     -H 'content-type: application/json' \
     -d '{"role": "review", "changeId": "<change-id>", "wait": true, "timeoutMs": 1800000}'
   ```

   Parse the response's `verdict` object:

   - `verdict.verdict == "pass"`:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "reviewed"}'
     ```
     Log: `[manager] iteration <n>: review pass, phase=reviewed`.
     Break the loop, proceed to step 7 (verify).

   - `verdict.verdict == "needs-rework"`:
     Format findings as an actionable prompt suffix:
     ```
     priorFindings = "Prior review findings to address:\n" +
                     verdict.findings.map(f =>
                       `- ${f.severity} ${f.file || ""}:${f.line || ""}` +
                       ` — ${f.message}`
                     ).join("\n")
     ```
     Log: `[manager] iteration <n>: review needs-rework (<count> findings), retrying code`.
     Continue loop (back to step 4).

   - `verdict` missing or malformed:
     Escalate with reason
     `Review returned no verdict on iteration <n>. artifactPaths: <list>`.
     Exit.

6. **After loop** (when we broke out of step 5 with pass)

   phase should be `reviewed`. Proceed to step 7.

7. **Verify stage**

   Dispatch the verify worker:

   ```bash
   curl -sS -X POST $ITHYNO_BASE/api/agents/dispatch \
     -H 'content-type: application/json' \
     -d '{"role": "verify", "changeId": "<change-id>", "wait": true, "timeoutMs": 1800000}'
   ```

   Parse the response's `verdict`:

   - `verdict.verdict == "pass"`:
     ```bash
     curl -sS -X POST $ITHYNO_BASE/api/changes/<change-id>/phase \
       -H 'content-type: application/json' \
       -d '{"phase": "done"}'
     ```
     Report to the user:
     ```
     Manager loop complete for <change-id>.
     Phase: done. <n> code/review iterations.
     The change is ready for /opsx:archive.
     ```
     Exit.

   - `verdict.verdict == "needs-rework"`:
     Escalate with reason `Verify failed: <verdict.summary>`. Include
     the findings so the user can see which command failed. Exit.

   - `verdict` missing:
     Escalate with reason `Verify returned no verdict.`. Exit.

## Guardrails

- **Convergence guard**: MAX_ITERATIONS is a hard ceiling. Do NOT
  bypass it under any circumstance. If a change is stuck at
  needs-rework after 5 iterations, human input is required. Silently
  raising the cap wastes tokens and hides real problems.

- **One phase update at a time**: only call `POST /api/changes/:id/phase`
  after the corresponding worker returned `status: completed` AND the
  review (for reviewed) or verify (for done) returned `verdict: pass`.
  Do NOT set phase from the Manager for `needs-human` — that's a
  worker's `/opsx:escalate` responsibility.

- **Do NOT modify code from the Manager session**. All code changes
  happen inside dispatched worker sessions. If the Manager needs to
  investigate, use Read-only tools. Modifying files from here breaks
  the audit trail (the worker's commit is the record of who wrote
  what).

- **Do NOT retry a failed worker without changing input**. If a code
  worker returned `status: failed` on the same promptSuffix twice in
  a row, escalate — do not loop indefinitely on the same failure.

- **Do NOT skip the phase check in step 2**. Re-entering the Manager
  on a change that's `done` or `needs-human` MUST be a no-op.

- **Escalation is Manager's last resort, not first**. Only escalate
  when the loop cannot make progress: worker failure, missing verdict,
  or convergence cap. A single needs-rework verdict is NOT an
  escalation trigger.

- **Restart recovery**: when the Manager is invoked a second time on
  the same change (e.g. because the PTY session died), the phase
  check in step 2 does the right thing automatically. A change at
  `coded` skips to review; at `reviewed` skips to verify.

- **Cancellation**: if the user cancels the Manager session (Ctrl+C in
  the PTY or Cancel button in Kanban), any in-flight dispatch also
  cancels via the runner's SIGTERM chain. The change's phase remains
  at whatever it was last set to; the user can re-run
  `/opsx:manage <id>` to resume.

## Follow-ups (not this change)

- Per-project `manager.maxIterations` field in `agents.yaml`
  (`docs/ideas/2026-07-11-manager-max-iterations-config.md`).
- Per-project verify command
  (`docs/ideas/2026-07-11-verify-command-per-project.md`).
- Cost tracking for Manager sessions
  (proposed in Fable-review notes, deferred to Phase 5+).
