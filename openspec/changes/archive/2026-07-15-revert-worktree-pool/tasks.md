# Tasks — revert-worktree-pool

## 1. Spec deltas

- [x] 1.1 4 REMOVED requirements in specs/agent-runner/spec.md
- [x] 1.2 `npm run openspec -- validate revert-worktree-pool` VALID

## 2. Impl reverts (server)

- [x] 2.1 `server/agents/pool.ts` + `pool.integration.test.ts` file 削除
- [x] 2.2 `server/agents/registry.ts`: `WorktreePoolConfig` / `DEFAULT_WORKTREE_POOL` / `validateWorktreePool` / `KNOWN_POOL_KEYS` / top-level `worktreePool:` parse / `worktreePoolConfig()` accessor / `AgentDef.dedicated` field 削除
- [x] 2.3 `server/agents/runner.ts`: `WorktreePool` import / `pool` field / `pool.acquire` / `pool.release` / `fromPool` field / `dedicated === false` branch / orphan-adoption の pool 認識分岐 撤去
- [x] 2.4 `server/agents/registry.test.ts` の pool 関連 test 削除 (存在時)

## 3. Impl reverts (UI)

- [x] 3.1 `web/src/types.ts`: `AgentPublic.dedicated` 削除
- [x] 3.2 `web/src/components/AgentConfigModal.tsx`: dedicated checkbox UI 削除
- [x] 3.3 `web/src/pages/Agents.tsx`: `· pool` 表示削除

## 4. agents.yaml migration

- [x] 4.1 現行 `agents.yaml` の `dedicated: false` (claude agent) を削除、`worktreePool:` block も削除

## 5. Target archive annotations

- [x] 5.1 `openspec/changes/archive/2026-07-05-add-worktree-pool/proposal.md` に REVERTED annotation 挿入

## 6. In-flight spec 注記

- [x] 6.1 PENDING REMOVAL annotation on 4 target requirements in specs/agent-runner/spec.md (SHALL 段落の後)

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean

## 8. Post-impl

- [x] 8.1 phase-workflow へ merge — N/A: in-place impl
- [x] 8.2 outcome.md 記入
- [ ] 8.3 `/ithy-opsx:archive revert-worktree-pool`
