## 1. registry — runtimeLabel の移動

- [ ] 1.1 `runtimeLabel(agent: AgentDef): string` を `server/agents/registry.ts` に export function として追加 (実装は既存 dispatch.ts と同じ: `agent.runtime ?? "legacy"`)
- [ ] 1.2 `server/agents/dispatch.ts` の `runtimeLabel` は削除 (or re-export に置き換え)
- [ ] 1.3 `dispatch.ts` の import を `registry.ts` の `runtimeLabel` に切替

## 2. artifact-scan — 新規モジュール

- [ ] 2.1 新規 `server/agents/artifact-scan.ts` を作成
- [ ] 2.2 `listChangeArtifacts(worktreePath: string, changeId: string): Promise<string[]>` を移植 (dispatch.ts から)
- [ ] 2.3 dispatch.ts の呼び出しを新モジュール import に置換
- [ ] 2.4 dispatch.ts 内の `listChangeArtifacts` 実装を削除

## 3. Job 型拡張

- [ ] 3.1 `server/agents/runner.ts` の `JobSummary` に:
  - `role: string` (required)
  - `runtime: string` (required)
  - `artifactPaths?: string[]` (optional)
- [ ] 3.2 `web/src/types.ts` の `JobSummary` にも同 3 field 追加、コメントで sync 元を明示

## 4. Runner — spawn 時に role/runtime を設定

- [ ] 4.1 `run()` 内で def から `role: def.role, runtime: runtimeLabel(def)` を job に付与
- [ ] 4.2 `adoptExistingOrphan()` 2 か所で `role: "orphan", runtime: "unknown"` を job に付与
- [ ] 4.3 `agent-job-started` broadcast で新 field が client に届くことを確認 (型で自動追随)

## 5. Runner — finish 時に artifactPaths populate

- [ ] 5.1 `finish()` (job が terminal 状態へ移る箇所) で `listChangeArtifacts(job.worktreePath, job.changeId)` を await
- [ ] 5.2 Job オブジェクトの `artifactPaths` に格納
- [ ] 5.3 `agent-job-finished` event は既存の `{ jobId, status, exitCode }` 形を保持 (別途 event 追加は Phase 5.1 で判断)
- [ ] 5.4 orphan adoption 時は artifact 検出しない (running 中でも finished でもない、adoption 特殊状態)

## 6. Dispatch — 再利用

- [ ] 6.1 `dispatch.ts` の `dispatch()` から `listChangeArtifacts` 呼び出しを削除
- [ ] 6.2 完了後の `runner.getJob(startedJob.id)?.artifactPaths ?? []` を DispatchResult.artifactPaths に反映
- [ ] 6.3 Timeout branch も同様に Job から読む

## 7. Tests — 既存の更新

- [ ] 7.1 `server/agents/dispatch.test.ts` — `runtimeLabel` の import 元変更に追随 (registry.ts へ)
- [ ] 7.2 既存 test で Job/JobSummary を assert しているものが role/runtime を含む形に (adopt-orphans.test.ts / worktree-progress.test.ts)

## 8. Tests — 新規

- [ ] 8.1 `server/agents/artifact-scan.test.ts` (新規) — `listChangeArtifacts` の unit test 移植 + 拡張
- [ ] 8.2 Runner の spawn テストで role/runtime が Job に載ることを assert (既存 test に追記)
- [ ] 8.3 Runner の finish テストで artifactPaths が populate されることを assert (integration スタイル、実 git worktree 必要なら pool.integration.test.ts に類似の仕組み)

## 9. Spec delta

- [ ] 9.1 `openspec/changes/extend-agent-job-model/specs/dashboard/spec.md` に **ADDED Requirements** 2 件:
  - **Job Model Includes Role And Runtime** — spawn 時に必ず設定される
  - **Job Model Includes Artifact Paths On Finish** — 完了後の artifact 一覧
- [ ] 9.2 `npm run openspec -- validate extend-agent-job-model` VALID

## 10. Verification

- [ ] 10.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 10.2 テスト数 — 211 から +5〜10 の想定

## 11. Post-impl

- [ ] 11.1 phase-workflow へ merge
- [ ] 11.2 archive → phase-workflow に archive commit
- [ ] 11.3 次: Phase 3.5 `add-review-artifact`
