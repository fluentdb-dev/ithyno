# Outcome: revert-runtime-detection

R4 of runtime-collapse pivot. R3 で stub 化してた `runtime-detect.ts` +
`/api/agents/runtimes` endpoint + `RuntimeDefPublic` 一族型を完全撤去。

## ✅ Worked

- **R3 の stub 化で clean cut できた**: R3 で先に `runtime-detect.ts` を
  RuntimeDef ↔ 内部 stub 型に切り離してあったので、R4 では単純に module
  ごと削除できた。stub 型の "R4 で消える" 予告も反故にならず
- **UI dead code の徹底掃除**: RuntimesSection component / RuntimeRow /
  loadRuntimes / runtimes state / runtimesError / fetchAgentRuntimes /
  型 4 個 (RuntimeDefPublic / RuntimePromptStyle / RuntimeDiffStrategy /
  RuntimeSupports / RuntimeStatusResponse) 全撤去
- **test 261 → 253**: 8 減 (runtime-detect.test.ts 削除分)
- **CSS `.runtime-*` クラスは untouched**: 静的アセットで dead code だが
  build size 影響軽微。cleanup は別 change or R6+ で

## ⚠️ Surprises

- **`agents-updated` reload hook の中に `clearRuntimeDetectionCache()`
  呼出があった**: R3 で stub 化した際は関数を残していたが、hook 呼出も
  同時に発見して撤去。R4 で 1 comment ブロック + 1 line 削減

## 🔁 Differently

- **R3 で stub 化を挟んだのが正解**: R4 を単独で走らせる場合の
  cleanup 範囲が明確 (「R3 の stub を消す」の 1 手で済む)。R3 で
  一気に消しにいってたら R4 の scope が「runtime-detect ファイル削除 +
  server 呼出撤去 + client 撤去 + 型定義撤去」で肥大化してた

## 🌱 Follow-ups

- **CSS `.runtimes-section` / `.runtime-*` cleanup**: build 影響軽微だが
  R5 (WorktreePool) or 後段の cleanup で touch
- **`docs/user-manual/multi-agent-cli.md` の runtime 記述**: R3 で削除
  対象になったが未 update。runtime-collapse 全体完了後に docs sync
- **R5 revert-worktree-pool** が次
