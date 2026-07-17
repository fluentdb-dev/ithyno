# Tasks — revert-add-dummy-tab

## 1. Reverted-target: strip specs, rewrite outcome

- [x] 1.1 `rm openspec/changes/add-dummy-tab/specs/dashboard/spec.md`
- [x] 1.2 `rmdir specs/dashboard specs`
- [x] 1.3 `openspec/changes/add-dummy-tab/outcome.md` 新規作成、
  reversal rationale + 検証 archive 2 本への link 記載

## 2. Reverted-target: archive

- [x] 2.1 `npm run openspec -- archive add-dummy-tab --yes` (0 delta
  warning は意図通り、spec fold なし)
- [x] 2.2 `openspec/changes/archive/2026-07-17-add-dummy-tab/` 存在
  確認、`openspec/specs/dashboard/spec.md` に `Playground Tab`
  requirement は着地せず

## 3. Worktree cleanup

- [x] 3.1 `git worktree remove --force .worktrees/add-dummy-tab`
  (worktree に copilot review.md の変更が残っていたため --force、
  revert の意図通り破棄)
- [x] 3.2 `git branch -D agent/add-dummy-tab` (was `64dd56a`)
- [x] 3.3 verify: no worktree、no branch

## 4. Revert-change validation

- [x] 4.1 `openspec validate revert-add-dummy-tab --strict` VALID
- [x] 4.2 `npm test` (213 pass / 1 skip) / `npm run typecheck` clean

## 5. Post-impl

- [x] 5.1 outcome.md
- [ ] 5.2 `/ithy-opsx:archive revert-add-dummy-tab`
