---
name: "OPSX: Dispatch"
description: Dispatch a role-based worker agent for a change (Phase 3)
category: Workflow
tags: [workflow, agents, dispatch, phase-3]
argument-hint: "<role> <change-id> [--runtime=<name>] [--prompt-suffix=\"<text>\"]"
---

Dispatch a role-based worker agent on a change via ithyno's dispatch
endpoint. The Ithyno server selects an agent from `agents.yaml` matching
the role + change specialties, runs it, and (by default) blocks until
completion. This command is primarily used by the Manager agent (Phase 4)
to advance the phase pipeline (`code` → `review` → `verify`).

**Input**: `$ARGUMENTS` must include a role and a change id in that order.
Optional flags: `--runtime=<name>` and `--prompt-suffix="<text>"`.

**Steps**

1. **Parse arguments**

   From `$ARGUMENTS`, extract:
   - `role` — first positional argument (required). Typical values: `code`, `review`, `verify`, `apply`.
   - `changeId` — second positional argument (required).
   - `runtime` — optional, from `--runtime=<name>`. When present, forces the runtime (must match an entry in `agents.yaml`'s `runtimes:` section).
   - `promptSuffix` — optional, from `--prompt-suffix="<text>"`. Additional instructions appended to the agent's prompt template.

   If role or changeId is missing, STOP and report which is missing.

2. **Build the JSON body**

   Construct a JSON object with the fields above. Set `wait: true`
   (default; the response blocks until the worker completes). Use
   `timeoutMs: 1800000` (30 minutes) unless the user specifies otherwise
   in the prompt.

3. **Call the dispatch endpoint via Bash**

   The Ithyno server listens on `localhost:4321` (adjust if the user's
   `ITHYNO_PORT` differs — check env if unsure). Use the Bash tool:

   ```bash
   curl -sS -X POST http://localhost:4321/api/agents/dispatch \
     -H 'content-type: application/json' \
     -d '<the JSON body>'
   ```

   The connection stays open until the worker terminates (`completed`,
   `failed`, `cancelled`, or `timeout`). Do NOT poll — the response
   arrives when the job ends.

4. **Parse the JSON response**

   The response is a `DispatchResult`:

   ```json
   {
     "jobId": "j-3",
     "agentName": "code-claude",
     "runtime": "claude",
     "status": "completed",
     "exitCode": 0,
     "stdoutTail": "...",
     "artifactPaths": ["openspec/changes/add-foo/review.md"]
   }
   ```

   Non-200 responses carry `{ error: "..." }` and (for 404 selector
   failures) `matches: []`.

5. **Report the outcome**

   Summarise for the caller (typically the Manager loop):

   - Chosen agent name and runtime
   - Status and exit code
   - **When `verdict` is present** (a review-role job that wrote a valid
     `review.md`), read `verdict.verdict` (`"pass"` or `"needs-rework"`),
     `verdict.findings[]`, and optional `verdict.summary` directly from
     the response — do NOT re-read `review.md`. Ithyno has already
     parsed and schema-validated the artifact. Report the verdict and
     per-finding `{severity, file?, line?, message}` to the caller.
   - When `verdict` is absent, list `artifactPaths[]` and (for
     escalation artifacts) read `needs-human.md` directly. Any other
     artifact type is opaque to Ithyno.
   - For `status: "failed"` or `status: "timeout"`, include the last
     ~1KB of `stdoutTail` and the exit code so the Manager can decide
     whether to retry / escalate / abort.

**Guardrails**

- Do NOT invoke `/opsx:dispatch` unless the Ithyno server is running on
  `localhost:4321` (or the configured port).
- Do NOT use `--wait=false` unless the caller explicitly wants
  fire-and-forget behavior — the Manager loop relies on the sync
  response to drive the next dispatch decision.
- Timeouts default to 30 minutes; increase for long-running verifiers
  only when the user explicitly asks.

**Fluid Workflow Integration**

- **Called by**: Manager (Phase 4 `/opsx:apply`) inside its work loop.
- **Bootstraps to**: existing `POST /api/agents/dispatch` (see Phase 3.2 spec).
- **Depends on**: `agents.yaml` declaring at least one agent with the
  requested role, and the change existing under `openspec/changes/`.
