# Tasks — revert-session-id-cli-wiring

## 1. Spec deltas

- [x] 1.1 3 REMOVED requirements in specs/dashboard/spec.md
- [x] 1.2 `npm run openspec -- validate revert-session-id-cli-wiring` VALID

## 2. Impl reverts (server)

- [x] 2.1 `server/agents/session-store.{ts,test.ts}` file 削除
- [x] 2.2 `server/agents/registry.ts`: `resolve()` の session_id 引数と `${session_id}` template 置換撤去
- [x] 2.3 `server/agents/runner.ts`: `run()` の sessionId param + `Job.sessionId` field 撤去
- [x] 2.4 `server/agents/registry-session-var.test.ts` file 削除

## 3. Impl reverts (UI)

- [x] 3.1 `web/src/types.ts`: `JobSummary.sessionId` 撤去

## 4. agents.yaml migration

- [x] 4.1 claude agent の args から `--session-id ${session_id}` 削除

## 5. Target archive annotations

- [x] 5.1 REVERTED annotation on `2026-07-14-add-session-id-template-var/proposal.md`

## 6. In-flight spec 注記

- [x] 6.1 PENDING REMOVAL on 3 target requirements (SHALL 段落の後)

## 7. Verification

- [x] 7.1 typecheck + tests + build clean

## 8. Post-impl

- [x] 8.1 phase-workflow へ merge — N/A: in-place
- [x] 8.2 outcome.md 記入
- [ ] 8.3 `/ithy-opsx:archive revert-session-id-cli-wiring`
