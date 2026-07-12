## 1. server/agents/config-writer.ts

- [ ] 1.1 `applyAgentConfigPayload(projectRoot, payload)` — parse current agents.yaml (or start from `{ agents: [] }` if missing), apply upsert / delete, run validation, atomic-write via `.tmp` sibling + rename
- [ ] 1.2 Payload validation helpers (`validateUpsertPayload` / `validateDeletePayload`) — reject shape errors with descriptive Error messages
- [ ] 1.3 Preserve unrelated top-level keys (`runtimes:`, `worktreePool:`, unknown) via parse → merge → stringify round-trip

## 2. server/agents/registry.ts

- [ ] 2.1 Export the internal `validateAgents` helper (or wrap it in `validateAgentDef(raw)`) so config-writer can reject bad payloads before disk hits

## 3. server/index.ts

- [ ] 3.1 New `POST /api/agents/config` Fastify handler:
  - isLocal + CSRF gates (403 on fail)
  - Body coercion (typeof checks per field, action discriminator)
  - Malformed → 400 with field-name error
  - Delete on missing name → 404
  - Success → 200 `{ ok: true }`
  - No manual `agentRegistry.load()` (the watcher handles it)

## 4. Tests

- [ ] 4.1 `server/agents/config-writer.test.ts`:
  - upsert on existing name overwrites in place
  - upsert on missing name appends at the end
  - delete removes the entry
  - delete on missing name throws (handler translates to 404)
  - `runtimes:` and unrelated keys survive round-trip byte-intent
  - atomic write: `.tmp` doesn't exist after success (or is cleaned up on failure)
  - malformed payload rejected without touching the file
- [ ] 4.2 Add a small handler-level test in an existing server test file
  if a suitable one exists — otherwise defer to Phase 5.2/5.3 smoke

## 5. Spec deltas

- [x] 5.1 1 ADDED `Agents Config Write Endpoint` requirement in `specs/dashboard/spec.md`
- [ ] 5.2 `npm run openspec -- validate add-agents-config-write` VALID

## 6. Verification

- [ ] 6.1 `npm test && npm run typecheck && npm run build` clean

## 7. Post-impl

- [ ] 7.1 phase-workflow へ merge (worktree flow)
- [ ] 7.2 archive → phase-workflow に archive commit
- [ ] 7.3 Manual smoke: `npm run dev`, open Agents tab, edit an agent, verify the save round-trips and the UI refreshes (this now works end-to-end after 5.2 + 5.3)
