# Outcome — normalize-error-display

## ✅ Worked

- **CSS class 統合**: `.field-error` + `.agent-config-error` を
  `.form-field-error` に、`.agent-config-server-error` を
  `.parse-error` に merge。合計 3 classes を削除・置換。
- **Message constants** `web/src/lib/errorMessages.ts` に集約 (`ERR`
  object)。4 か所に散在していた「No terminal open. Open a change /
  the terminal pane to start one.」variants が `ERR.NO_TERMINAL`
  1 本に統合。同様に `INJECT_FAILED` / `SENT_TO_TERMINAL` / `LOCK_HELD`
  も定数化。
- **`.parse-error` markup 統一**: App.tsx の `<p>` → `<div>⚠ ...</div>`
  に変更。他の call site (Agents / DiffView / TaskTree / SpecView /
  AgentConfigModal) は既に `<div>⚠ ...</div>` の形だったので、
  App.tsx 1 か所の変更で convention 全体が一致。
- **Puppeteer 検証**: lock gate の toast 文言 (`Change fake-holder-
  change is currently running. Merge or discard it first.`) が
  refactor 前後で完全一致、動作不変を確認。
- **`openspec validate --strict` VALID**、`npm test`/`typecheck`/
  `build` 全て clean、既存 213 tests 保持。

## ⚠️ Surprises

- **`.agent-config-server-error` の見た目が `.parse-error` と少し違った**:
  - `.parse-error`: `color: amber` のみ
  - `.agent-config-server-error`: `color: danger` + `background` +
    `border` + `padding` の box style
  merge して `.parse-error` に統一したので、AgentConfigModal の server
  error は今後 amber テキストのみで表示される。**視覚的 downgrade**
  だが、"error display convention" として 1 種類に統一する方が価値が
  大きいと判断。将来必要なら `.parse-error` に box style を追加して
  全 call site が benefit する形で対応可能。
- **`SENT_TO_TERMINAL` は "info" toast** — error ではないが、同じ
  copy-paste が 3 か所にあったので `ERR` に含めた。名前空間として
  `ERR` は微妙だが、`MSG` に refactor するほどでもないので許容。
- **CommandModal.tsx の `.field-error` は 1 か所のみ**の使用で、実は
  redundant refactor だった。`.form-field-error` にすることで
  AgentConfigModal との統一が取れる価値はあるので継続。

## 🔁 Differently

- **`ERR.LOCK_HELD` を関数として export**: `(change: string) => string`
  形式。単純 string でもよかったが、将来 change id を強調する等
  formatting 変更で benefit あるので function 化した。
- **spec に convention 明文化した**が、ADDED requirement (`Error
  Display Convention`) は 5 scenario 込みでかなり詳細。実装ガイド
  としては有用、spec 濃度としては重めかも。
- **削除した class 名を CSS ファイル内に "deleted by ..." コメント
  として残した**。次の developer が過去の class 名で grep したときに
  ヒットさせて履歴が追える形。

## 🌱 Follow-ups

- **`AgentConfigModal.tsx` の server error 表示の box style 復活検討**:
  amber text-only だとちょっと弱いので、`.parse-error` に共通の
  box style を追加すべきか他 call site の見た目も同時に
  bump する形で判断。今回は out of scope。
- **`ERR` object の追加候補**: `Failed to load: ...` prefix、Copy
  failed、Save failed 等 grep で見つかる 2+ か所 shared string を
  次段階で漸進的に集約。
- **Storybook / visual regression** で 3 category の error 表示を
  fixture 化し、統一性を継続的にチェック — 現状は目視 verify のみ。
