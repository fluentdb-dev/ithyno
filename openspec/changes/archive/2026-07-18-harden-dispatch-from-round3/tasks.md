# Tasks — harden-dispatch-from-round3

## 1. PENDING annotation

- [x] 1.1 `openspec/specs/dashboard/spec.md` の
  `### Requirement: Dispatch Slash Command` に PENDING MODIFIED
  annotation (English) を SHALL 段落直後に挿入

## 2. Spec delta

- [x] 2.1 `openspec/changes/harden-dispatch-from-round3/specs/dashboard/spec.md`
  に MODIFIED `Dispatch Slash Command` を full form で記述
  (前段の landed change から reproduce → 3 変更を織り込む)

## 3. Skill body

- [x] 3.1 `.claude/commands/ithy-opsx/dispatch.md` を編集:
  - Manager registration guard を dispatch 冒頭に追加 (join.sh idempotent)
  - 各 stage 開始前に team.sh で verify + 再 join
  - code-stage judgment から "if a new commit landed" 分岐を削除
  - Failure recovery ladder 節を新設 (despawn → leave + kill-pane / reset.sh 禁止)

## 4. agents.yaml default

- [x] 4.1 `agents.yaml` の `claude` エントリを更新:
  - `prompts.code: /ithy-opsx:apply ${change_id}` →
    `prompts.code: /opsx:apply ${change_id}`
  - `description` を "apply only" 版に書き換え

## 5. Verify

- [x] 5.1 `openspec validate harden-dispatch-from-round3 --strict` VALID
- [x] 5.2 `npm test && npm run typecheck && npm run build` clean
  (skill + config edits — API 契約変更なし)
- [x] 5.3 dispatch skill を目視レビュー: Manager reg guard の
  join.sh call が code / review / verify 各 stage 前に発火するか

## 6. Post-impl

- [x] 6.1 `outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups)
- [ ] 6.2 `/ithy-opsx:archive harden-dispatch-from-round3`
