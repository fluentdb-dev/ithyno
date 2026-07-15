# Tasks — revert-runtime-abstraction

## 1. Spec deltas

- [x] 1.1 2 REMOVED requirements in specs/dashboard/spec.md (Backward Compatibility With Command-Based Agents は reshape で MODIFIED 済みなので触らない)
- [x] 1.2 `npm run openspec -- validate revert-runtime-abstraction` VALID

## 2. Impl reverts (server)

- [x] 2.1 `server/agents/registry.ts`: `RuntimeDef` type + `runtimes:` yaml parse + inheritance in `resolve()` + `runtimeLabel()` 削除
- [x] 2.2 `server/agents/registry.ts`: `publicConfig()` の `runtimes: []` 削除
- [x] 2.3 grep: `runtime` / `RuntimeDef` の残存参照を server/ から一掃 (`config-writer.ts`, `runtime-detect.ts` は R4 対象なので触らない)

## 3. Impl reverts (UI)

- [x] 3.1 `web/src/types.ts`: `RuntimeDefPublic` 型 + `AgentPublic.runtime?` field + `AgentConfigPublic.runtimes` field 削除
- [x] 3.2 `web/src/components/AgentConfigModal.tsx`: Runtime dropdown / inherited command/args preview / `pick a runtime OR set a command` validation / prompt source badge の runtime 分岐 撤去
- [x] 3.3 `web/src/store.ts` / `web/src/api.ts` / `web/src/pages/Agents.tsx`: `runtime` field 参照があれば patch

## 4. Test updates

- [x] 4.1 `server/agents/registry-reshape.test.ts`: runtime inheritance / runtime-backed agent 系 test 削除
- [x] 4.2 `server/agents/registry-initial-input.test.ts` (存在時): runtime 由来 initialInput 系 test 削除

## 5. Target archive annotations

- [x] 5.1 `openspec/changes/archive/2026-07-07-add-runtime-abstraction/proposal.md` に REVERTED annotation 挿入

## 6. In-flight spec 注記

- [x] 6.1 PENDING REMOVAL annotation on 3 target requirements in openspec/specs/dashboard/spec.md — **SHALL 段落の後** (R1/R2 lesson)

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean

## 8. Post-impl

- [x] 8.1 phase-workflow へ merge (worktree flow) — N/A: in-place impl
- [x] 8.2 outcome.md 記入
- [ ] 8.3 `/ithy-opsx:archive revert-runtime-abstraction`
