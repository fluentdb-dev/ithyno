## 1. server/agents/config-writer.ts

- [x] 1.1 `applyAgentConfigPayload(projectRoot, payload)` — parse current agents.yaml (or start from `{ agents: [] }` if missing), apply upsert / delete, run validation, atomic-write via `.tmp` sibling + rename
- [x] 1.2 `coercePayload(raw)` — reject shape errors with descriptive messages (kebab-case name / concurrency ≥ 1 / mutually exclusive shapes / required fields)
- [x] 1.3 Preserves unrelated top-level keys (`runtimes:`, `worktreePool:`, unknown) via parse → merge → stringify round-trip

## 2. server/agents/registry.ts

- [x] 2.1 Exported `validateAgents` so config-writer can reject bad payloads with the loader's own rules before the write hits disk

## 3. server/index.ts

- [x] 3.1 New `POST /api/agents/config` Fastify handler:
  - isLocal + CSRF gates (403 on fail)
  - Body coercion via `coercePayload` (400 on shape error)
  - Delete on missing name → 404 (from `applyAgentConfigPayload`)
  - Success → 200 `{ ok: true }`
  - No manual `agentRegistry.load()` — the file watcher handles it

## 4. Tests

- [x] 4.1 `server/agents/config-writer.test.ts` — 17 tests:
  - upsert on existing name overwrites in place, preserving order
  - upsert on missing name appends at the end
  - upsert creates the file when missing
  - delete removes the entry
  - delete on missing name returns 404 with byte-identical file
  - `runtimes:` / `worktreePool:` / unknown keys survive round-trip
  - runtime-backed shape supported; legacy fields don't leak
  - malformed payload rejected without touching the file
  - atomic write: `.tmp` doesn't exist after success
  - coerce: null / non-object / unknown action / uppercase name / concurrency 0 / mixed shape / neither shape / valid legacy / valid delete

## 5. Spec deltas

- [x] 5.1 1 ADDED `Agents Config Write Endpoint` requirement in `specs/dashboard/spec.md`
- [x] 5.2 `npm run openspec -- validate add-agents-config-write` VALID

## 6. Verification

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean (240 → 257 tests)
- [x] 6.2 UI (end-to-end with 5.2): change an agent's role in the modal and Save → HTTP 200, the entry in agents.yaml carries the new value; `worktreePool` survives byte-identical — verified during step 1 (claude worker Save preserves worktreePool block)
- [x] 6.3 UI: `+ Add agent` with a new kebab-case name → Save → HTTP 200, a new entry appears in agents.yaml and a new row appears in Configured (idle) — verified during step 1 (copilot-review added, appears in Configured (idle) after `fix: reload agent registry synchronously after config write`)
- [ ] 6.4 UI: Delete → confirm → HTTP 200, the entry is removed — pending (step 3 will exercise via revert workflow if it removes agents)
- [ ] 6.5 API: `curl` a delete with a missing name → 404 with `agent '<name>' not found`
- [ ] 6.6 API: `curl` a malformed payload (concurrency=0 / mixed shape) → 400 with an inline error message; agents.yaml stays unchanged
- [ ] 6.7 API: atomic write — kill the server mid-write; `.tmp` may remain but agents.yaml is byte-identical to the pre-write state

## 7. Post-impl

- [x] 7.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 7.2 archive → user runs `/ithy-opsx:archive` after confirming 6.2–6.7
- [ ] 7.3 Manual smoke — merged into 6.2–6.7
