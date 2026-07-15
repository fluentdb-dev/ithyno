# Outcome: revert-manager-agent-config (Case β partial)

Final revert (R9) of runtime-collapse pivot. Manager section visual
special-casing 撤去。Manager agent は通常の Configured 一覧に出る形へ。

## ✅ Worked

- **Case β 手順**: 2 in-flight change (add-agents-tab-manager-section,
  refine-manager-fallback-copy) を specs/ 削除 + outcome.md rewrite +
  `openspec archive --skip-specs` で reverted-target archive
- **UI 撤去**: ManagerSection component + ManagerRow + ManagerDefaultsCard
  + fallbackToPrefillAgent 削除。ManagerStatus type / fetchManagerStatus /
  loadManagerStatus / managerStatus state / /api/manager/status endpoint
  全撤去
- **Terminal PTY routing 残す**: add-manager-agent-config の
  `ptyStartup()` は untouched。pptr agent は agents.yaml の `role: manager`
  として Terminal panel に自動 spawn される (実運用に必要)
- **Modal manager guardrail 残す**: 誤って複数 Manager 定義するのを
  防ぐ singleton constraint はそのまま
- **test 215 pass 継続 (dead code 削除だけ、test count 不変)**

## 🌱 Follow-ups (runtime-collapse 全体)

R1-R9 完了で runtime layer 縮約は一段落。残 follow-up:
- **CSS `.runtime-*` / `.manager-*` cleanup** (R4-R9 で発生した dead CSS)
- **`add-agmsg-integration` propose** — pivot の enabler (idea note の
  A1)。live-shell mode の実装先を agmsg にする
- **`add-parallel-execution-config` propose** — ExecutionPicker を
  config に落とす (idea note A2)
- **docs/user-manual/multi-agent-cli.md** 更新 — runtime 記述を drop
- **skills 書き直し** (`/opsx:manage` の内部): `POST /api/agents/dispatch`
  を叩く指示があれば Task tool 直接呼びに置換

累計 diff (R1-R9): server -4000+ LOC, web -1000 LOC, test 318 → 215
(103 減), agents.yaml 47 → 32 lines (schema slim)
