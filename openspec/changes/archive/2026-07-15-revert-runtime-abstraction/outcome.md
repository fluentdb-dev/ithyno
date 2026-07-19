# Outcome: revert-runtime-abstraction

R3 of runtime-collapse pivot. `runtimes:` block と agent の `runtime:` 参照
+ inheritance ロジックを撤去。`RuntimeDef`/`RuntimeSupports`/`PromptStyle`/
`DiffStrategy` 型 + `runtimeLabel()` 関数削除。Modal Advanced から Runtime
dropdown 削除。

## ✅ Worked

- **PENDING annotation は最初から SHALL 段落の後**: R1/R2 lesson 適用で
  strict validator PASS のまま archive 直行できた (R1 のような
  `--no-validate` deadlock 回避)
- **Backward Compatibility With Command-Based Agents は残せた**: reshape で
  MODIFIED 済みで normalization spec に repurpose されていたため、R3 では
  触らず (proposal Case α → PARTIALLY REVERTED)
- **UI 変更は Advanced dropdown 1 つの撤去**: Common section の command /
  args / prompts / roles / mode はそのまま。ユーザ視点の日常操作は変わらない
- **`resolve()` の分岐が半減**: runtime branch 消失で `promptStyle`/`promptFlag`
  の局所変数不要に。`isExplicitPrompt` チェックも「agent.prompts 有無」の
  1 tier に単純化
- **test 283 → 261**: 22 tests 削除 (registry-runtime.test.ts 全部 + reshape
  の runtime-inheritance / runtime-backed shape / config-writer の
  runtime-backed パターン)
- **runtimeLabel は R2 で unused 化していた**: 予告通り R3 で削除、
  side effect 無し

## ⚠️ Surprises

- **AgentConfigPayload に runtime field があった**: types.ts の payload
  shape に `runtime?: string` があり、type から抜くとテスト fixture が
  excess property になる。TypeScript の strict-object-literal ではない
  branch でひっそり通っていた — 削除で発覚
- **`runtime-detect.ts` は R4 対象と proposal に書いたが、そのままだと
  RuntimeDef import で typecheck 落ちた**: 内部で `RuntimeMap = Record<string,
  {command:string}>` を宣言して繋いだ。R4 で丸ごと消える
- **server/index.ts の runtime detection cache は R4 対象**: 同様に
  `clearRuntimeDetectionCache()` を stub 化、`GET /api/agents/runtimes` を
  「常に空 list を返す」に縮約。R4 で完全撤去

## 🔁 Differently

- **`resolvePromptForRole()` の signature 変更 (3-arg → 2-arg)**: 呼び出し側
  (registry-reshape.test.ts) の runtime-map 引数を消す修正が必要だった。
  breaking change だが internal API なので影響範囲は限定
- **Modal の runtime prop drop で Agents.tsx caller も修正**: prop 型が
  変わったので、prop pass 側 (Agents.tsx L191) の `runtimes={runtimes?.runtimes ?? []}`
  行も同時削除。React strict props で catch できたので typecheck が
  ガード

## 🌱 Follow-ups

- **R4 revert-runtime-detection**: runtime-detect.ts + `RuntimeMap` stub +
  runtime detection cache + `/api/agents/runtimes` endpoint + web types
  (`RuntimeDefPublic`, `RuntimeStatusResponse`) を丸ごと撤廃
- **Agents.tsx の Runtimes セクション** (もし表示していれば): R4 で撤去
- **CSS `.runtimes-section` / `.runtime-*` クラス**: R4 で cleanup
- **agent-config Modal の Advanced「Runtime option」削除の documentation**
  update: `docs/user-manual/` があれば sync (R4 or 別 doc-sync change)
