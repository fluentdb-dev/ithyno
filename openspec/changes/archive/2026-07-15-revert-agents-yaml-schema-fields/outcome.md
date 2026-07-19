# Outcome: revert-agents-yaml-schema-fields

R8 of runtime-collapse pivot. specialties + concurrency 撤去。roles[] は
skill dispatch judgment に必須なので残す。

## ✅ Worked

- **agent-runner spec (別 capability)** に PENDING annotation で clean cut
- **schema slim 化**: AgentDef から 2 field 消失、Modal Advanced から
  Specialties input 撤去 (Description のみ残る)
- **test 220 → 215**: config-writer + registry test の concurrency/specialties
  validation test を削除

## 🌱 Follow-ups

- **R9 revert-manager-agent-config** が最終 revert
- `pending #75 add-worktree-task-toggle-writeback 実装` は runtime-collapse
  と orthogonal、別 track で処理
