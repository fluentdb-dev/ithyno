## 1. `/opsx:review` slash command

- [x] 1.1 `.claude/commands/opsx/review.md` 新規作成、frontmatter (name, description, argument-hint)
- [x] 1.2 Body: proposal / tasks / spec / diff の Read 手順
- [x] 1.3 review.md schema 準拠の書き方 (verdict / findings / summary)
- [x] 1.4 pass / needs-rework の rubric 明記
- [x] 1.5 findings entry 形式明記

## 2. `/opsx:verify` slash command

- [x] 2.1 `.claude/commands/opsx/verify.md` 新規作成、frontmatter
- [x] 2.2 npm test → typecheck → build を Bash で実行
- [x] 2.3 fail-fast (前が fail したら skip)
- [x] 2.4 結果を review.md に書く (pass / needs-rework、summary、findings)
- [x] 2.5 Node 決め打ちを明記、per-project idea note reference

## 3. `/opsx:escalate` slash command

- [x] 3.1 `.claude/commands/opsx/escalate.md` 新規作成
- [x] 3.2 POST /api/changes/:id/needs-human を Bash + curl で叩く
- [x] 3.3 context 組み立て指示 (phase / tasks 抜粋 / prior review)
- [x] 3.4 200/400/404/409 の handling

## 4. `/opsx:answer` slash command

- [x] 4.1 `.claude/commands/opsx/answer.md` 新規作成
- [x] 4.2 POST /api/changes/:id/needs-human/answer を Bash + curl
- [x] 4.3 200/400/404/409 の handling、409 は editor fallback ケース

## 5. Spec delta

- [x] 5.1 4 ADDED requirements
- [x] 5.2 `npm run openspec -- validate add-worker-skills` VALID

## 6. Manual verification

- [ ] 6.1 Sample project + review agent — DEFERRED to post-merge smoke
- [ ] 6.2 /opsx:dispatch review add-foo で動作確認 — DEFERRED
- [ ] 6.3 verify も同様 — DEFERRED

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` clean (code 変更なし、tests 234 維持)

## 8. Post-impl

- [x] 8.1 phase-workflow へ merge — merge step で
- [x] 8.2 archive → phase-workflow に archive commit — archive step で
- [x] 8.3 次: Phase 4.2 `add-manager-loop-skill`
