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
- [ ] 6.2 UI (5.2 と end-to-end): Modal で agent の role を変えて Save → HTTP 200、agents.yaml の該当 entry が新値に、他 entry / `runtimes:` / `worktreePool:` は byte-identical に保持
- [ ] 6.3 UI: + Add agent → 新 name (kebab-case) → Save → HTTP 200、agents.yaml に entry 追加、Configured (idle) に新 row 出現
- [ ] 6.4 UI: Delete → confirm → HTTP 200、agents.yaml から entry 削除、Configured (idle) から row 消える
- [ ] 6.5 API: 存在しない name で Delete API 叩く (curl) → 404 + `agent '<name>' not found`
- [ ] 6.6 API: 不正 payload (concurrency=0 / mixed shape) → 400 + inline error、agents.yaml は無変更
- [ ] 6.7 API: atomic write — 意図的に mid-write でサーバー kill → `.tmp` は残るが agents.yaml は old のまま

## 7. Post-impl

- [x] 7.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 7.2 archive → user が 6.2 を確認後に実施
- [ ] 7.3 Manual smoke — 6.2 と統合
