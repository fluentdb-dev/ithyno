---
name: "ITHY-OPSX: Escalate"
description: Post an escalation to needs-human for the given change
category: Workflow
tags: [workflow, escalate, needs-human, worker, phase-4]
argument-hint: "<change-id> \"<question>\""
---

Escalate the specified change to human review by hitting Ithyno's
needs-human endpoint. This slash command wraps
`POST /api/changes/<change-id>/needs-human` (landed by Phase 2's
`add-needs-human-phase`) so an agent that got stuck can put the change
in the needs-human state and hand off to the user.

**Input**: `$ARGUMENTS` includes:
- `<change-id>` — first positional argument (required)
- `"<question>"` — remaining argument (required), the exact question
  to record

## Steps

1. **Parse arguments**

   Extract `changeId` and `question` from `$ARGUMENTS`. If either is
   missing or empty, STOP and report:
   `Usage: /ithy-opsx:escalate <change-id> "<question>"`

2. **Assemble context**

   Read the current state of the change to include as `context` in the
   escalation body:
   - Current phase from `openspec/changes/<change-id>/.openspec.yaml`
   - Last 30 lines of `tasks.md` (which items are ticked, which are not)
   - If a `review.md` exists, its `summary` and verdict
   - Any relevant error messages from the current session

   Build a `context` string, keep it under ~1500 characters so the
   escalation record stays readable in the dashboard.

3. **POST the escalation**

   Use the Bash tool:

   ```bash
   curl -sS -X POST "${ITHYNO_BASE:-http://localhost:${ITHYNO_PORT:-4321}}/api/changes/<change-id>/needs-human" \
     -H 'content-type: application/json' \
     -d '{"question":"<question>","context":"<context>"}'
   ```

   `ITHYNO_BASE` is exported into the Manager PTY by the ithyno server
   (per-project ephemeral port under Electron / VSCode). Do NOT
   hardcode `http://localhost:4321` — it will connection-refuse under
   packaged shells.

   Escape the JSON body appropriately (use a heredoc or Node's
   JSON.stringify equivalent to avoid quoting bugs).

4. **Interpret the response**

   - **HTTP 200** — success. Report:
     `Escalated <change-id>. Change is now in needs-human; awaiting
     answer.`
   - **HTTP 400 (empty question)** — should not happen if step 1's
     validation is honored. Report the endpoint's error verbatim.
   - **HTTP 404 (change not found)** — the change id is wrong. Report
     the endpoint's error.
   - **HTTP 409 (already escalated)** — the change is already in
     needs-human. Report and DO NOT retry.

5. **Do not modify the change dir**

   Escalation is a state transition, not a code edit. The endpoint
   writes `needs-human.md` server-side (Phase 2 substrate). Do not
   touch it directly.

## Guardrails

- **One open escalation per change**. The 409 return is intentional.
  Do not delete `needs-human.md` and retry.
- **Do NOT include secrets in context**. The context is stored in the
  change dir and may be committed by the Manager. Strip API keys,
  tokens, and PII before building the body.
- **Do NOT invoke this from an interactive user session with the
  intent of asking the user directly**. This command records an
  escalation to the state machine; the actual user Q&A happens when
  the Manager (or a future gate agent) picks up the answer via
  `/ithy-opsx:answer` or the editor fallback.
