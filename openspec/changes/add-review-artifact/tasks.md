## 1. Parser module — `server/agents/review-parser.ts` (新規)

- [ ] 1.1 Types: `ReviewVerdict`, `ReviewSeverity`, `ReviewFinding`, `ReviewArtifact` を export
- [ ] 1.2 `parseReviewContent(raw: string): ReviewArtifact | null` — gray-matter で frontmatter parse、schema 検証、body を分離
- [ ] 1.3 `parseReview(projectRoot, changeId): Promise<ReviewArtifact | null>` — `openspec/changes/<id>/review.md` を読んで parse
- [ ] 1.4 Validate:
  - `verdict` は `"pass" | "needs-rework"` のいずれか、他は reject
  - `findings` が array なら各要素検証: `severity` enum、`message` non-empty string
  - `file` は optional string、`line` は optional positive integer
  - `findings` 以外の未知 key は無視 (前方互換)
- [ ] 1.5 File 不在、read 失敗、YAML parse エラー、schema 違反 — 全部 `null` を return (throw しない)
- [ ] 1.6 `body`: frontmatter を除いた raw markdown を保持

## 2. Runner — finish 時 review parse

- [ ] 2.1 `server/agents/runner.ts::finish()` で `artifactPaths` の中に `review.md` があるか判定
- [ ] 2.2 あれば `parseReview(projectRoot, changeId)` を await、`job.verdict` に set
- [ ] 2.3 Populate 順序: artifactPaths → verdict → status flip (既存 atomicity)
- [ ] 2.4 review-role でない job / review.md 生成しない agent は verdict undefined のまま

## 3. Job / JobSummary 拡張

- [ ] 3.1 `server/agents/runner.ts::JobSummary` に `verdict?: ReviewArtifact` 追加
- [ ] 3.2 `web/src/reviewTypes.ts` (新規) — ReviewArtifact / ReviewFinding / ReviewSeverity / ReviewVerdict の client mirror、コメントで hand-sync 明記
- [ ] 3.3 `web/src/types.ts::JobSummary` に `verdict?: ReviewArtifact` を追加、import 元は `./reviewTypes`

## 4. DispatchResult 拡張

- [ ] 4.1 `server/agents/dispatch.ts::DispatchResult` に `verdict?: ReviewArtifact` 追加
- [ ] 4.2 `dispatch()` の完了 branch で `outcome.verdict` を DispatchResult に反映
- [ ] 4.3 Timeout branch で `runner.getJob(id)?.verdict` を read

## 5. Slash command 更新

- [ ] 5.1 `.claude/commands/opsx/dispatch.md` の "Response の使い方" 節を書き換え
- [ ] 5.2 `verdict` field が present なら直接 `verdict.verdict` と `verdict.findings` を Manager に報告
- [ ] 5.3 `verdict` unset なら artifactPaths を list するだけ (Phase 3.5 まで の挙動)
- [ ] 5.4 Response 例 JSON も `verdict: { verdict: "needs-rework", findings: [...] }` を含む形に更新

## 6. Tests — parser 新規

- [ ] 6.1 `parseReviewContent` — 正常 pass verdict
- [ ] 6.2 `parseReviewContent` — 正常 needs-rework + findings 2 件
- [ ] 6.3 `parseReviewContent` — frontmatter 無し → null
- [ ] 6.4 `parseReviewContent` — verdict 無し → null
- [ ] 6.5 `parseReviewContent` — verdict が enum 外 → null
- [ ] 6.6 `parseReviewContent` — findings が array でない → null
- [ ] 6.7 `parseReviewContent` — finding.severity が invalid → null
- [ ] 6.8 `parseReviewContent` — finding.message が空 → null
- [ ] 6.9 `parseReviewContent` — finding.line が非整数 → null
- [ ] 6.10 `parseReviewContent` — 未知 top-level key は無視 (前方互換)
- [ ] 6.11 `parseReviewContent` — findings 省略時は空配列
- [ ] 6.12 `parseReviewContent` — summary optional
- [ ] 6.13 `parseReviewContent` — body 保持 (frontmatter 除いた markdown)
- [ ] 6.14 `parseReview` (fs 版) — 存在する tmp file で正常
- [ ] 6.15 `parseReview` — 存在しない file で null

## 7. Tests — 既存の更新

- [ ] 7.1 `web/src/util/changeState.test.ts` の `runningJob()` fixture: verdict は optional で追加不要 (`?` 型)、pass

## 8. Spec delta

- [ ] 8.1 `openspec/changes/add-review-artifact/specs/dashboard/spec.md` に 3 ADDED requirements:
  - **Review Artifact Schema** — review.md frontmatter contract
  - **Job Model Includes Verdict** — Runner が parse + set
  - **DispatchResult Includes Verdict** — sync response で Manager に渡る
- [ ] 8.2 `npm run openspec -- validate add-review-artifact` VALID

## 9. Verification

- [ ] 9.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 9.2 テスト数 — review-parser.test.ts に 15 前後

## 10. Post-impl

- [ ] 10.1 phase-workflow へ merge
- [ ] 10.2 archive → phase-workflow に archive commit
- [ ] 10.3 Phase 3 完了、次: Phase 4.1 `add-manager-prompt-and-skills`
