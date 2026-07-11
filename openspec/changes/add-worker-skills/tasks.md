## 1. `/opsx:review` slash command

- [ ] 1.1 `.claude/commands/opsx/review.md` 新規作成、frontmatter (name, description, argument-hint)
- [ ] 1.2 Body: Change の proposal / tasks / spec / diff を Read する手順
- [ ] 1.3 review.md の書き方: verdict / findings / summary の schema 準拠 (Phase 3.5 で確定した frontmatter format)
- [ ] 1.4 verdict の判定基準明記: pass / needs-rework の rubric
- [ ] 1.5 findings 記述: `{severity, file?, line?, message}` の形

## 2. `/opsx:verify` slash command

- [ ] 2.1 `.claude/commands/opsx/verify.md` 新規作成、frontmatter
- [ ] 2.2 Body: `npm test`, `npm run typecheck`, `npm run build` を Bash で順に実行
- [ ] 2.3 fail-fast: 前の command が fail したら次を skip
- [ ] 2.4 結果を review.md に書く (verdict: pass or needs-rework、summary、findings に error 情報)
- [ ] 2.5 Node 決め打ちを明記 (Fable MEDIUM #6、Phase 4 完了後の idea note に移す予定)

## 3. `/opsx:escalate` slash command

- [ ] 3.1 `.claude/commands/opsx/escalate.md` 新規作成
- [ ] 3.2 Body: `POST /api/changes/:id/needs-human` を Bash + curl で叩く手順
- [ ] 3.3 Body に含める `context` を change 現状 (recent diff, phase, prior review) から組み立てる指示
- [ ] 3.4 成功/失敗を caller に報告

## 4. `/opsx:answer` slash command

- [ ] 4.1 `.claude/commands/opsx/answer.md` 新規作成
- [ ] 4.2 Body: `POST /api/changes/:id/needs-human/answer` を Bash + curl で叩く
- [ ] 4.3 成功/失敗を caller に報告

## 5. Spec delta

- [ ] 5.1 `openspec/changes/add-worker-skills/specs/dashboard/spec.md` に 4 ADDED requirements:
  - **Review Worker Slash Command** — /opsx:review が review.md schema に沿う出力を書く
  - **Verify Worker Slash Command** — /opsx:verify が Node チェーンを実行し review.md 経路で報告
  - **Escalate Command Wrapper** — /opsx:escalate が /api/changes/:id/needs-human を叩く
  - **Answer Command Wrapper** — /opsx:answer が /api/changes/:id/needs-human/answer を叩く
- [ ] 5.2 `npm run openspec -- validate add-worker-skills` VALID

## 6. Manual verification

- [ ] 6.1 Sample project に `runtimes.claude` + `role: review` agent を用意
- [ ] 6.2 `/opsx:dispatch review add-foo` を Claude Code terminal から叩き、review.md が生成されることを確認 — DEFERRED to post-merge smoke
- [ ] 6.3 verify も同様に確認 — DEFERRED

## 7. Verification

- [ ] 7.1 `npm test && npm run typecheck && npm run build` clean (slash command 追加のみ、code 変更なしなので Test 変わらず)

## 8. Post-impl

- [ ] 8.1 phase-workflow へ merge
- [ ] 8.2 archive → phase-workflow に archive commit
- [ ] 8.3 次: Phase 4.2 `add-manager-loop-skill`
