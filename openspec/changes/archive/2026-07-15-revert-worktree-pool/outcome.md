# Outcome: revert-worktree-pool

R5 of runtime-collapse pivot. WorktreePool + `worktreePool:` block +
`dedicated` field + pool acquire/release/orphan-adopt/restart 全撤去。
agent は常に `.worktrees/<change-id>/` dedicated worktree。

## ✅ Worked

- **runner.ts の pool 分岐撤去でシンプル化**: `def.dedicated === false`
  branch (67-line) が消え、run() は「dedicated worktree only」の 1 パス
- **`dedicated` field 同時撤去**: user 提案時は R8 に回す予定だったが、
  pool の opt-in flag なので pool と一緒に消すのが自然
- **agents.yaml migration も 1 発**: 現行 yaml の `worktreePool:` block と
  `dedicated: false` (claude agent) を削除、他は保持
- **test 253 → 238**: pool.integration.test.ts (7) + registry.test.ts の
  dedicated/worktreePool 系 (8) 削除、config-writer.test.ts の runtime/
  dedicated 系 fixture patch
- **strict validator passes on agent-runner spec** (別 capability だが問題無し)

## ⚠️ Surprises

- **config-writer.ts に runtime + dedicated field が残っていた**: R3 で
  types.ts の AgentConfigPayload から runtime を消したが config-writer の
  UpsertPayload 型 (別定義) には残存。R5 impl 中に発見して同時撤去
- **agents.yaml.example の存在確認しなかった**: `agents.yaml.example` を
  ripple check したが該当 file 無し、影響なし

## 🔁 Differently

- **UI 側で `· pool` badge を Modal だけでなく AgentRow でも表示していた**:
  検索範囲を Modal + Agents.tsx 全体に広げるべきだった。次以降は
  `grep -rn "<removed-concept>" web/src/` を最初に一発
- **`dedicated: true` 明示指定を tests fixture に多数書いていた**: sed で
  一括削除。fixture の default が実装 default と一致してるなら明示不要

## 🌱 Follow-ups

- **CSS `.runtime-*` / `.runtimes-*` 未 cleanup**: R4 で保留した通り
- **R6 revert-agent-pty-runner** が次: PTY runner 一式 (add-agent-pty-runner
  + add-agent-stdin-relay + add-agent-initial-input + add-agent-xterm-output
  など複数 change の統合撤去)。pending #76 `revert-agent-pty-layers` と統合
- **Manager 特別扱い (R9)** の際に `pptr` agent 定義を見直す必要
