# Tasks — thread-model-arg-through-agmsg-spawn

## 1. PENDING annotation

- [x] 1.1 `openspec/specs/dashboard/spec.md` の
  `### Requirement: Dispatch Slash Command` の SHALL 段落直後に
  `> ⚠️ **PENDING MODIFIED** by [thread-model-arg-through-agmsg-spawn]
  (../../changes/thread-model-arg-through-agmsg-spawn/): agmsg branch
  で entry.args から --model <id> を抽出して spawn call に thread`
  を挿入

## 2. Skill 更新

- [x] 2.1 `.claude/commands/ithy-opsx/dispatch.md` の agmsg branch
  の "AGMSG_TYPE derivation" と `/agmsg spawn ...` の間に、bash で
  `entry.args` を走査して `--model <id>` を extract する block を
  追加
- [x] 2.2 spawn call を `/agmsg spawn "$AGMSG_TYPE" "$entry_name"
  $MODEL_ARG --boot-prompt "..."` に変更。MODEL_ARG は空文字列
  (未指定時) or `"--model $VAL"` (指定時)
- [x] 2.3 bare `--model` (次の token 無し) の escalation 文言:
  `agents.yaml agent "<name>" has bare --model without a value in args`
- [x] 2.4 spawn.sh 側の error はそのまま surface (silent fallback
  なし) と本文に明記

## 3. Verify

- [x] 3.1 `openspec validate thread-model-arg-through-agmsg-spawn
  --strict` VALID
- [x] 3.2 `npm test && npm run typecheck && npm run build` clean
  (skill-only なので regression check のみ)
- [x] 3.3 bash test: skill 内の抽出ロジックを切り出して手動 test:
  `args: [--dangerously-skip-permissions, --model, sonnet]` →
  MODEL_ARG=`"--model sonnet"`; `args: [--continue]` → MODEL_ARG=`""`;
  `args: [--model]` → escalate

## 4. Post-impl

- [x] 4.1 outcome.md
- [ ] 4.2 `/ithy-opsx:archive thread-model-arg-through-agmsg-spawn`
