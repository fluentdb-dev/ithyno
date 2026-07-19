# Outcome: revert-dispatch-endpoint

R1 (最初の segmented revert) を実行。`POST /api/agents/dispatch` +
`selectAgent` (role/specialty/runtime filter) を撤去。skill 経由
(`/opsx:manage`, `/opsx:code`) に dispatch 判断を戻す方針の第一歩。

## ✅ Worked

- **削除範囲がきれいに孤立**: `dispatch.ts` は独立 module で、import
  side は `server/index.ts` (route handler) + 2 個の test file だけ。
  同 handler の body 全部 + import 1 行を削るだけで済んだ
- **test 側 clean cut**: `dispatch.test.ts` (単体) + `dispatch-session.test.ts`
  (integration) を丸ごと削除、`registry-reshape.test.ts` の
  `multi-role dispatch selection` describe block だけ手動除去 (comment stub
  で今後の混乱回避)
- **typecheck 一発通過**: 別 module が `selectAgent` を触っていなかったため
- **test 総数 318 → 290**: 28 テスト減 (dispatch 系専用)、他 regression 無し
- **runner.ts に残った comment refs は無害**: 「dispatch context」という
  概念的な言及だけで import は無い。R2 (revert-agent-job-model) で
  runner.ts 自体を大幅撤退する際に一緒に整理される

## ⚠️ Surprises

- **`dispatch-session.test.ts` の存在を忘れていた**: 元 tasks.md には
  `dispatch.test.ts` しか書いてなかったが、`add-session-id-template-var`
  (Phase 5 頃) で追加された integration test を発見。grep で捕捉できた
  ので実害無しだが、事前スキャンで見落とすと typecheck 失敗になっていた
- **Manager loop skill (`/opsx:manage`) の `/opsx:dispatch` 参照は未対応**:
  tasks.md 2.5 で対応予定だったが、grep すると `.claude/skills/opsx-manage/`
  自体がまだ無く、slash command `.claude/commands/opsx/manage.md` の中身も
  Task tool 前提で書かれていて `/opsx:dispatch` を直接呼ぶ箇所が無かった。
  Phase 4.2 の manager-loop-skill 実装が最初から skill-based だったため
  reboot 必要なかった

## 🔁 Differently

- **事前 grep で test file を全部拾うべきだった**: 「dispatch」だけでなく
  「selectAgent」+ 「/api/agents/dispatch」を同時に grep すればよかった。
  次の R2 以降では最初に "target module の全 import site を洗う" 手順を
  1 段目に置く
- **runner.ts の dispatch 系 comment を段階的に消すのを skip した**: R2 の
  改修と競合するので今回は触らない判断は正しいが、tasks.md に明記
  しなかったので後で確認する時に迷いそう。次回は「今回触らない範囲」を
  明示的に task として書く

## 🌱 Follow-ups

- **R2 (revert-agent-job-model)** を次に着手: runner.ts の job model
  拡張 (dispatchedRole / verdict / reviewOutput 等) を撤退
- **runner.ts の comment cleanup** は R2 でまとめて対応
- **Manager loop skill の実装状況** を確認: `/opsx:manage` は現在
  Task tool ベースで動く前提だが実装が空 stub の可能性あり (未検証)
- **手動 verify 6.2 / 6.3** は dev server 再起動時に確認
