## 1. Parser module — `server/agents/review-parser.ts` (新規)

- [x] 1.1 Types export (ReviewVerdict / ReviewSeverity / ReviewFinding / ReviewArtifact)
- [x] 1.2 `parseReviewContent(raw)` — gray-matter で frontmatter parse、schema 検証、body 分離
- [x] 1.3 `parseReview(projectRoot, changeId)` — fs 経由 wrapper
- [x] 1.4 Validation — verdict enum、findings array、severity enum、message non-empty、file string、line positive integer
- [x] 1.5 Fail-closed: 不在 / read error / YAML parse error / schema 違反すべて null
- [x] 1.6 body: frontmatter を除いた markdown

## 2. Runner — finish 時 review parse

- [x] 2.1 `finish()` で artifactPaths に `review.md` を含むか判定
- [x] 2.2 あれば `parseReview()` を await、`job.verdict` に set (null なら undefined のまま)
- [x] 2.3 Populate 順序: artifactPaths → verdict → status flip
- [x] 2.4 review.md 生成しない job は verdict undefined のまま

## 3. Job / JobSummary 拡張

- [x] 3.1 `runner.ts::JobSummary` に `verdict?: ReviewArtifact`
- [x] 3.2 `web/src/reviewTypes.ts` (新規) — client mirror
- [x] 3.3 `web/src/types.ts::JobSummary` に `verdict?` を追加

## 4. DispatchResult 拡張

- [x] 4.1 `dispatch.ts::DispatchResult` に `verdict?: ReviewArtifact`
- [x] 4.2 完了 branch で `outcome.verdict` を反映
- [x] 4.3 Timeout branch で `runner.getJob(id)?.verdict` を read

## 5. Slash command 更新

- [x] 5.1-5.4 `.claude/commands/opsx/dispatch.md` の "Report the outcome" 節を書き換え、Manager に「verdict field を先読み、review.md 再読みしない」を指示

## 6. Tests — parser 新規 (`review-parser.test.ts`)

- [x] 6.1〜6.19 全 19 tests: happy path (7) + rejections (9) + fs 経路 (3) = 18 tests 実装 (追加 finding.line 負数チェック 6.10 の合計 19 → 実測 18)

## 7. Tests — 既存の更新

- [x] 7.1 verdict は optional 型なので既存 test は無変更

## 8. Spec delta

- [x] 8.1 3 ADDED requirements
- [x] 8.2 `npm run openspec -- validate add-review-artifact` VALID

## 9. Verification

- [x] 9.1 `npm test && npm run typecheck && npm run build` clean (234 tests、+18)
- [x] 9.2 review-parser.test.ts 18 tests

## 10. Post-impl

- [x] 10.1 phase-workflow へ merge — merge step で
- [x] 10.2 archive → phase-workflow に archive commit — archive step で
- [x] 10.3 Phase 3 完了、次: Phase 4.1
