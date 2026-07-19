# Tasks — revert-runtime-detection

## 1. Spec deltas

- [x] 1.1 2 REMOVED requirements in specs/dashboard/spec.md
- [x] 1.2 `npm run openspec -- validate revert-runtime-detection` VALID

## 2. Impl reverts (server)

- [x] 2.1 `server/agents/runtime-detect.ts` + `runtime-detect.test.ts` file 削除
- [x] 2.2 `server/index.ts`: `GET /api/agents/runtimes` route 削除、`clearRuntimeDetectionCache()` stub 削除、agents reload hook から呼出除去

## 3. Impl reverts (UI)

- [x] 3.1 `web/src/types.ts`: `RuntimeDefPublic` / `RuntimePromptStyle` / `RuntimeDiffStrategy` / `RuntimeSupports` / `RuntimeStatusResponse` 削除
- [x] 3.2 `web/src/api.ts`: `fetchRuntimes()` 等の client 関数削除
- [x] 3.3 `web/src/store.ts`: runtimes state / loadRuntimes 削除
- [x] 3.4 `web/src/pages/Agents.tsx`: Runtimes section 撤去 (存在時)
- [x] 3.5 `web/src/styles.css`: `.runtimes-*` / `.runtime-*` CSS 削除

## 4. Target archive annotations

- [x] 4.1 `openspec/changes/archive/2026-07-08-add-runtime-detection/proposal.md` に REVERTED annotation 挿入

## 5. In-flight spec 注記

- [x] 5.1 PENDING REMOVAL annotation on 2 target requirements (SHALL 段落の後)

## 6. Verification

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean

## 7. Post-impl

- [x] 7.1 phase-workflow へ merge — N/A: in-place impl
- [x] 7.2 outcome.md 記入
- [ ] 7.3 `/ithy-opsx:archive revert-runtime-detection`
