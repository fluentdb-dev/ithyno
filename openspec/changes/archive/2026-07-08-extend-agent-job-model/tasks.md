## 1. registry — runtimeLabel の移動

- [x] 1.1 `runtimeLabel(agent: AgentDef): string` を `server/agents/registry.ts` に追加
- [x] 1.2 `server/agents/dispatch.ts` の `runtimeLabel` を削除
- [x] 1.3 `dispatch.ts` の import を registry の `runtimeLabel` に切替

## 2. artifact-scan — 新規モジュール

- [x] 2.1 新規 `server/agents/artifact-scan.ts` を作成
- [x] 2.2 `listChangeArtifacts()` を実装 (dispatch.ts から移植 + `--untracked-files=all` フラグ追加)
- [x] 2.3 dispatch.ts の呼び出しは削除 (Job から読む形へ)
- [x] 2.4 dispatch.ts 内の `listChangeArtifacts` 実装削除

## 3. Job 型拡張

- [x] 3.1 `server/agents/runner.ts` の `JobSummary` に `role` / `runtime` / `artifactPaths?` 追加
- [x] 3.2 `web/src/types.ts` の `JobSummary` にも同 3 field 追加 (mirror コメント付き)

## 4. Runner — spawn 時に role/runtime を設定

- [x] 4.1 `run()` 内で `role: def.role, runtime: runtimeLabel(def)` を job に付与
- [x] 4.2 `adoptOrphanWorktrees()` 2 か所で `role: "orphan", runtime: "unknown"` を job に付与
- [x] 4.3 `agent-job-started` broadcast は型追随で自動で新 field を含む

## 5. Runner — finish 時に artifactPaths populate

- [x] 5.1 `finish` を async 化、`listChangeArtifacts(worktreePath, changeId)` を await
- [x] 5.2 `job.artifactPaths` に格納 (エラー時は空配列)
- [x] 5.3 順序制御: artifactPaths を先に set、その後 job.status を terminal に flip (polling consumer が status 遷移で atomic に artifactPaths を見られる)
- [x] 5.4 `child.on("exit", ...)` は `void finish(...)` で fire-and-forget
- [x] 5.5 Orphan adoption は finish 経路を通らないので artifactPaths は omitted (spec 通り)

## 6. Dispatch — 再利用

- [x] 6.1 dispatch.ts の `listChangeArtifacts` 呼び出しを削除
- [x] 6.2 完了 branch で `outcome.artifactPaths ?? []` を DispatchResult へ
- [x] 6.3 Timeout branch で `runner.getJob(id)?.artifactPaths ?? []` を DispatchResult へ

## 7. Tests — 既存の更新

- [x] 7.1 `dispatch.test.ts` — `runtimeLabel` の import 元を registry.ts に変更
- [x] 7.2 `web/src/util/changeState.test.ts` — `runningJob()` fixture に `role: "coder"`, `runtime: "legacy"` 追加
- [x] 7.3 他 test で JobSummary を組み立てるものは無し (既存 test は runner.run() 経由でしか Job を作らない、既に新 field で作られる)

## 8. Tests — 新規

- [x] 8.1 `server/agents/artifact-scan.test.ts` (新規、5 tests) — `listChangeArtifacts` を tmp git repo で検証:
  - 変更なしで空配列
  - change dir 内の new file を検出
  - change dir 外の file は除外
  - 非 git repo で空配列
  - 存在しない worktree path で空配列
- [ ] 8.2 Runner の role/runtime テスト、finish 時の artifactPaths テスト — DEFERRED (統合 test の setup コストが大きく、既存 pool.integration.test.ts のパターンを流用するには 100+ LOC 必要。artifact-scan の unit test で listChangeArtifacts の contract は担保、runner 側の統合は Phase 3.5 で review-artifact test を書く時に一緒に押さえる)

## 9. Spec delta

- [x] 9.1 `openspec/changes/extend-agent-job-model/specs/dashboard/spec.md` に 2 ADDED requirements
- [x] 9.2 `npm run openspec -- validate extend-agent-job-model` VALID

## 10. Verification

- [x] 10.1 `npm test && npm run typecheck && npm run build` clean (216 tests、+5)
- [x] 10.2 テスト数増 — artifact-scan.test.ts 5 tests

## 11. Post-impl

- [x] 11.1 phase-workflow へ merge — merge step で
- [x] 11.2 archive → phase-workflow に archive commit — archive step で
- [x] 11.3 次: Phase 3.5 `add-review-artifact`
