---
name: "ITHY-OPSX: Answer"
description: Submit an answer to close a needs-human escalation for the given change
category: Workflow
tags: [workflow, answer, needs-human, worker, phase-4]
argument-hint: "<change-id> \"<answer>\""
---

Answer a change's open needs-human escalation by hitting Ithyno's
answer endpoint. This slash command wraps
`POST /api/changes/<change-id>/needs-human/answer` (landed by Phase
2's `add-needs-human-phase`). On success the server restores the
change's `priorPhase` and clears the escalation fields, effectively
returning the change to the phase it was in before being escalated.

**Input**: `$ARGUMENTS` includes:
- `<change-id>` — first positional argument (required)
- `"<answer>"` — remaining argument (required), the exact answer text

## Steps

1. **Parse arguments**

   Extract `changeId` and `answer` from `$ARGUMENTS`. If either is
   missing or empty, STOP and report:
   `Usage: /ithy-opsx:answer <change-id> "<answer>"`

2. **POST the answer**

   Use the Bash tool:

   ```bash
   curl -sS -X POST http://localhost:4321/api/changes/<change-id>/needs-human/answer \
     -H 'content-type: application/json' \
     -d '{"answer":"<answer>"}'
   ```

   JSON-escape the answer body (heredoc or JSON.stringify).

3. **Interpret the response**

   - **HTTP 200** — success. The change has been restored to its
     `priorPhase`. Report:
     `Answer submitted for <change-id>. Restored to <priorPhase>.`
     (Extract `priorPhase` from the response body if present.)
   - **HTTP 400 (empty answer)** — should not happen if step 1's
     validation is honored. Report verbatim.
   - **HTTP 404 (change not found)** — wrong change id. Report
     verbatim.
   - **HTTP 409 (not in needs-human)** — the change is not currently
     escalated. This can happen if the user answered via the editor
     fallback (chokidar-detected footer flip) between when the
     escalation opened and when this command runs. Report
     `Change <change-id> is no longer in needs-human — probably
     answered via editor.` and treat it as success (the desired state
     is already reached).

4. **Do not modify needs-human.md directly**

   The answer endpoint appends `## Answer` and flips the footer to
   `answered: true` server-side. Do not edit the file from this
   command.

## Guardrails

- **Do NOT retry on 200 or 409**. Both indicate the change is out of
  needs-human; retry would 409 again with no progress.
- **Do NOT chain to the next Task worker from here**. Manager
  (`/opsx:manage`) is responsible for re-picking up the change after
  answer succeeds. This command's only job is to submit the answer.
- **Do NOT include secrets in the answer**. The endpoint appends the
  answer to `needs-human.md`, which will be committed as part of the
  change dir on the next archive.
