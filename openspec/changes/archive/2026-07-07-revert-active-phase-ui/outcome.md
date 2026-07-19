# Outcome — revert-active-phase-ui

## ✅ Worked

- **Judgment axis の切り替えは局所化された。** `slot` 中心の分岐から
  `change.phase` + `slot` (progress 用) の 2 軸に組み替えたが、
  ChangeCard のリファクタは 30 行程度で済んだ。`isNeedsHuman` を先頭に
  出して boolean を precompute する形にしたら残りは自然に減った。
- **bucketize の `priorPhase` フォールバック** が spec のシナリオを
  そのまま表現できた: `isPhase(c.priorPhase) ? c.priorPhase : "proposed"`
  の 1 行で、reviewer round-1 の High 指摘 #1 (bucket 削除だけでは
  unphased に落ちる) を封じられる。
- **Test の入れ替えが 3:3 で対称**。needs-human bucket 前提の 2 test を
  消し、priorPhase-based の 3 test に差し替え。net +1 test (146 → 146
  ではなく 161 → 162 が正しい、Kanban.test.ts の需要人系は既に 2 個削除、
  代わりに 3 個追加で +1)。 test 数の変化が small で意味論の変化が large
  な入れ替えなので、reviewer が「削除と追加が対応している」と読める。
- **CSS の掃除は素直だった。** `.kanban-needs-human*` 一族が明確に
  block 化されていたので削除は grep + sed 相当で 1 発。`.kanban-card.
  needs-human` の border 色は保持したので需要人 card は border で
  控えめに識別できる。
- **DnD 一切除去**。`useDraggable` / `useDroppable` / `DndContext` /
  `PointerSensor` / `useSensor` / `useSensors` / `DragEndEvent` の全
  import を削除。code path から drag が完全に消えたので副作用の心配が
  無い。今後 drag を戻すには全部を復活させる必要がある = 意図的な高い
  戻し hurdle。
- **spec REMOVED delta** が openspec validate をそのまま通した。事前に
  archived した change の要件を削除する Case α 手続きが機能。

## ⚠️ Surprises

- **`useDraggable` を消したら `<div>` に戻せた** が、既存 card class
  `.draggable` を JSX から落とすのを忘れていた (revert 前の class 名
  `"kanban-card${isDragging ? " dragging" : ""}${isNeedsHuman ? "
  needs-human" : " draggable"}"`)。今の revert 版は `needs-human` class
  のみ conditional。壊れた表示は無いが、`.draggable` selector を
  参照している CSS が無いか確認は post-merge に defer。
- **`.kanban-phase-select` は元々 CSS ファイルに無かった** — inline
  style + native select の default で足りていた。tasks 4.2 に「削除」と
  書いていたが noop で完了。
- **`Slot` type union は残った** が `"needs-human"` が消えて
  `Phase | UnphasedSubBucket` の shape に戻った。前 revert 前は
  `Slot === "needs-human"` の分岐点が多かったが、今は分岐が `slot ===
  "unphased-done"` の progress dot 判定 1 箇所だけ。Type 経路が細くなった。

## 🔁 Differently

- **もし最初から Manager-first 前提で設計していれば**、
  `add-kanban-phase-lanes` と `add-needs-human-phase` の UI は最初から
  この形状で landed していたはず。3 change 分の archive commit + 1
  revert commit の "history が真実を語る" 形は今の openspec の revert
  workflow が正しく機能した証拠でもある。実装済の revert は spec 側で
  責任範囲を明示するのが最も誠実。

## 🌱 Follow-ups

- **Phase 3 change 一覧** (前 doc §5.3): `add-runtime-abstraction` から
  `add-escalation-bell` まで 12 change。次 session で propose 開始。
- **Change 詳細ページ変更なし**: ここでの revert には触れていない。
  Change 詳細に agent activity を入れない方針は user 判断で確定済。
- **`.kanban-card .draggable` の残骸掃除**: revert では触れていないが、
  もし CSS 側で `.draggable` selector が残っていれば dead code。
  post-merge の cleanup 対象候補。
- **`phase-workflow` → `main` batch merge**: 別 session で。この revert
  archive commit を最後に merge する。

## Notes

- Kanban.tsx の diff は大きい (~180 LOC 減、~90 LOC 追加、net 約 -90) が
  意味論の変化は「User が phase を触るか否か」の 1 点で、コードの複雑度
  は下がった (DnD 関連の import 群 + 分岐 tree が消えた)。
- Backend は一切変更なし。Phase API / sidecar / needs-human artifact /
  editor fallback / 全て Phase 3 Manager が使う substrate として意図
  通り保持されている。
- Spec delta が REMOVED requirements で validate を通したのは openspec
  の Case α revert の意図通り。archive 時に
  `openspec/specs/dashboard/spec.md` から 3 要件が物理削除される。
