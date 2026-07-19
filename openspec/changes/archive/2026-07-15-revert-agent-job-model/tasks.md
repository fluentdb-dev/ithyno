# Tasks — revert-agent-job-model

## 1. Spec deltas

- [x] 1.1 2 REMOVED requirements in specs/dashboard/spec.md
- [x] 1.2 `npm run openspec -- validate revert-agent-job-model` VALID

## 2. Impl reverts (server)

- [x] 2.1 `server/agents/runner.ts`: JobSummary から `role` / `runtime` / `artifactPaths` field 削除
- [x] 2.2 `server/agents/runner.ts`: `run(...)` の `dispatchedRole?` param + `effectiveRole` ロジック削除
- [x] 2.3 `server/agents/runner.ts`: `listChangeArtifacts()` 呼び出しとインポート削除
- [x] 2.4 `server/agents/artifact-scan.ts`: file 削除 (dispatch と共に用途消失)

## 3. Impl reverts (UI)

- [x] 3.1 `web/src/types.ts`: JobSummary から `role` / `runtime` / `artifactPaths` field 削除
- [x] 3.2 `web/src/pages/Agents.tsx`: `job-role-badge` / `job-runtime-badge` span 削除

## 4. Test updates

- [x] 4.1 `server/agents/artifact-scan.test.ts` (存在すれば) 削除
- [x] 4.2 orphan adoption test など JobSummary.role/runtime を assert している箇所を patch or 削除

## 5. Target archive annotations

- [x] 5.1 `openspec/changes/archive/2026-07-08-extend-agent-job-model/proposal.md` に REVERTED annotation 挿入

## 6. In-flight spec 注記

- [x] 6.1 PENDING REMOVAL annotation on 2 target requirements in openspec/specs/dashboard/spec.md — **配置は SHALL 段落の後** (R1 lesson: openspec strict validator は heading 直後の blockquote を text 部として parse して SHALL/MUST を見失う)

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean

## 8. Post-impl

- [x] 8.1 phase-workflow へ merge (worktree flow) — N/A: in-place impl on phase-workflow
- [x] 8.2 outcome.md 記入
- [ ] 8.3 `/ithy-opsx:archive revert-agent-job-model`
