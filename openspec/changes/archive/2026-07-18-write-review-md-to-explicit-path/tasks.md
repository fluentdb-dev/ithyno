# Tasks — write-review-md-to-explicit-path

## 1. PENDING annotation

- [x] 1.1 `openspec/specs/dashboard/spec.md` の
  `### Requirement: Dispatch Slash Command` に PENDING MODIFIED
  annotation (英語) を挿入

## 2. Skill: `<TARGET_PATH>` の計算

- [x] 2.1 `.claude/commands/ithy-opsx/dispatch.md` の worktree setup
  step で `TARGET_PATH` を絶対パスで export:
  - worktree mode: `TARGET_PATH="$(pwd)/.worktrees/<change-id>"`
  - main-tree mode: `TARGET_PATH="$(pwd)"`
- [x] 2.2 以後の agmsg branch spawn boot-prompt から
  `$TARGET_PATH` を参照

## 3. Skill: boot-prompt に artifact contract 追加 (review/verify のみ)

- [x] 3.1 `S = review` or `S = verify` の時だけ boot-prompt に
  artifact contract セクションを prepend (report contract より前)
- [x] 3.2 code stage は artifact contract 追加なし
  (review.md 書かないので不要)

## 4. Skill: Manager 側の read path 修正

- [x] 4.1 message wait 後の artifact judgment で
  `$TARGET_PATH/openspec/changes/<change-id>/review.md` を read
- [x] 4.2 absent 時の escalation message にも path を含める:
  `<stage> reported done but did not write review.md at <path>`

## 5. Verify

- [x] 5.1 `openspec validate write-review-md-to-explicit-path --strict` VALID
- [x] 5.2 `npm test && npm run typecheck && npm run build` clean
  (skill-only 変更)
- [ ] 5.3 (deferred) 手動 e2e: 実 dispatch で review.md が
  worktree の正しい path に書かれることを確認

## 6. Post-impl

- [x] 6.1 outcome.md
- [ ] 6.2 `/ithy-opsx:archive write-review-md-to-explicit-path`
