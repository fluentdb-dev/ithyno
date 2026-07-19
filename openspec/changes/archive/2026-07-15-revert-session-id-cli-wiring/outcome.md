# Outcome: revert-session-id-cli-wiring

R7 of runtime-collapse pivot. `${session_id}` template var + session-store
+ Job.sessionId 撤去。

## ✅ Worked

- **clean cut**: session-store は単独 module、削除 + registry の template
  置換 1 行 + runner の 1 field で全撤去
- **agents.yaml migration も 2 行**: claude agent の
  `--session-id ${session_id}` 2 line 削除で完了
- **test 238 → 220**: session-store.test (10) + registry-session-var.test (6)
  + 他 fixture patch 分

## ⚠️ Surprises

- 無し。R1〜R6 で周辺コードは既に消えてたので、session-id は本当に
  isolated feature だった

## 🌱 Follow-ups

- **R8 revert-agents-yaml-schema-fields** (concurrency / specialties 撤去)
- `.ithyno/sessions.json` は無害な残骸として project root に残る
- **`add-worktree-task-toggle-writeback` (pending #75)**: 別 track の pending
  task、runtime-collapse とは orthogonal
