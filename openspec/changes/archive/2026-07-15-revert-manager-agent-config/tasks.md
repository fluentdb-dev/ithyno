# Tasks — revert-manager-agent-config (Case β partial)

## 1. Spec deltas

- [x] 1.1 1 ADDED requirement in specs/dashboard/spec.md (post-revert baseline)
- [x] 1.2 validate VALID

## 2. Impl (UI)

- [x] 2.1 web/src/pages/Agents.tsx: ManagerSection + ManagerRow + ManagerDefaultsCard 削除
- [x] 2.2 web/src/api.ts: fetchManagerStatus() 削除
- [x] 2.3 web/src/store.ts: managerStatus / loadManagerStatus 削除
- [x] 2.4 web/src/types.ts: ManagerStatus type 削除
- [x] 2.5 web/src/styles.css: `.manager-*` CSS 削除

## 3. Impl (server)

- [x] 3.1 server/index.ts: GET /api/manager-status endpoint + 依存 helper 削除

## 4. Reverted-target archive procedure (Case β)

- [x] 4.1 add-agents-tab-manager-section の specs/ を delete、outcome.md を "reverted by revert-manager-agent-config" に rewrite
- [x] 4.2 refine-manager-fallback-copy の specs/ を delete、outcome.md も同様
- [x] 4.3 openspec archive add-agents-tab-manager-section --yes (revert 本体より前に)
- [x] 4.4 openspec archive refine-manager-fallback-copy --yes

## 5. Verification

- [x] 5.1 typecheck + tests + build clean

## 6. Post-impl

- [x] 6.1 phase-workflow へ merge — N/A: in-place
- [x] 6.2 outcome.md 記入
- [ ] 6.3 `/ithy-opsx:archive revert-manager-agent-config` (target archive の後)
