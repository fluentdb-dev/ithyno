# Outcome: revert-agent-job-model

R2 of runtime-collapse pivot. `JobSummary` から `role` / `runtime` /
`artifactPaths` field 撤去 + `listChangeArtifacts` scanner 削除。

## ✅ Worked

- **R1 lesson を先手で適用**: PENDING annotation を SHALL 段落**の後**に
  配置 → strict validator PASS。R1 で悩んだ archive deadlock を回避
- **`parseReview` の null-safe API に助けられた**: `artifactPaths` を
  介した review.md 存在確認を消したが、`parseReview` 自体が missing
  file を null で返すので guard 削除で済んだ
- **削除範囲がきれいに孤立**: `runner.ts` 内の 3 field 削除 + 1 param
  削除 + 1 scanner 呼び出し削除 + orphan adoption path の 2 箇所 (role/runtime
  init 削除)。UI 側は Agents.tsx の 2 span 削除 + types.ts の 3 field 削除
- **test 285 pass**: 290 → 283 (dispatch-related 消失分と artifact-scan.test.ts
  削除、`role: "coder"` の changeState.test.ts fixture patch)
- **archive block 無し**: dashboard/spec.md strict VALID 継続 → 単独 archive
  可能 (R1 のような deadlock 無し)

## ⚠️ Surprises

- **`runtimeLabel(def)` import が unused に**: `runtime: runtimeLabel(def)`
  を削除したので registry.ts の import が dead code に。`unused-imports`
  lint が無いので typecheck 通過するが、次の R3-R4 で registry.ts を
  触るときに同じ関数の呼び出し元は 0 になっているはず

## 🔁 Differently

- **削除範囲を先に impl → test で確認 → 全 tick、の順にできた**: R1 の
  「後から追加 test を発見」問題を回避 (最初に grep で全 site を洗う手順を
  R1 outcome で反省してた通り実行)

## 🌱 Follow-ups

- **R3 revert-runtime-abstraction** を次に着手: `runtimes:` block +
  inheritance 撤退
- `runtimeLabel(def)` が本 revert 後に unused になったので R3/R4 で削除
- Agents tab の Recent Jobs は role/runtime badge が無くなって少し寂しく
  なった。verdict badge は残るので job の意義は追えるが、agent 名だけで
  何をしていたか判別しづらい場合がある。将来的な「skill 呼び出し履歴」表示は
  agmsg / Task tool の履歴を出す方向に舵切りする際に検討
