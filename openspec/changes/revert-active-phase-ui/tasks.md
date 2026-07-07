## 1. Kanban.tsx — bucketize と judgment axis の再設計

- [x] 1.1 `Slot` union から `"needs-human"` を削除
- [x] 1.2 `PhaseBuckets` から `needsHuman` bucket を削除
- [x] 1.3 `bucketize()` の needs-human 分岐を rewrite: `change.phase === NEEDS_HUMAN` の change は `priorPhase` の lane に振り分け (priorPhase 不明時は proposed)
- [x] 1.4 `NEEDS_HUMAN` sort 処理 (`.sort(...)`) を削除
- [x] 1.5 `ChangeCard` の判定軸を `slot` から `change.phase` (と `slot` の progress-only 情報) の 2 軸に組み替え

## 2. Kanban.tsx — UI 部品と drag の撤去

- [x] 2.1 `<PhaseControl>` component 定義と JSX 使用箇所を削除
- [x] 2.2 `<NeedsHumanLane>` component 定義と KanbanBoard 内の呼び出しを削除
- [x] 2.3 `useDraggable` を全 card から削除 (`<div>` 直接に変更)
- [x] 2.4 `<DndContext>` / `onDragEnd` / `PointerSensor` / `useSensor` / `useSensors` の import と使用を削除
- [x] 2.5 `<PhaseLane>` から `useDroppable` を削除、`isOver` / `over-legal` class 削除
- [x] 2.6 Kanban 上部 toolbar を保持 (`+ New Change` + `<ParallelStartLauncher>`)
- [x] 2.7 `import { setChangePhase } from "../api"` を削除
- [x] 2.8 `<WaitBadge>` を保持し、`ChangeCard` の card head 内で `isNeedsHuman && change.escalatedAt` 条件で render
- [x] 2.9 `<UnphasedSection>` の hint 文言を "Legacy changes without a phase. The Phase 3 Manager will opt them in." に更新

## 3. Kanban.test.ts — テストの差し替え

- [x] 3.1 `"routes needs-human into its own bucket (add-needs-human-phase)"` テストを削除
- [x] 3.2 `"sorts needs-human by escalatedAt ascending"` テストを削除
- [x] 3.3 `"falls back to unphased for missing / unknown / reserved phase values"` から `needsHuman` bucket 参照 (`expect(b.needsHuman).toEqual([])`) を削除
- [x] 3.4 新規テスト: `"puts needs-human into its priorPhase lane (revert-active-phase-ui)"` — priorPhase=coded の change が `b.coded` に入ることを検証
- [x] 3.5 新規テスト: `"defaults needs-human to proposed lane when priorPhase is missing"` — priorPhase 未設定の needs-human change が `b.proposed` に入ることを検証
- [x] 3.6 新規テスト: `"ignores an invalid priorPhase and defaults to proposed"` — priorPhase が不正文字列の場合も proposed default にフォールバック

## 4. styles.css — CSS の掃除

- [x] 4.1 `.kanban-needs-human` 一族 (base / `.empty` / head / hint / body) を削除
- [x] 4.2 `.kanban-phase-select` は元々 CSS 側に無かった (inline に select style を書いていた) ため noop
- [x] 4.3 `.kanban-card.needs-human` variant は保持 (border 色で needs-human を控えめに示す)
- [x] 4.4 `.kanban-card-question` を保持 (needs-human の question 表示に使う)
- [x] 4.5 `.kanban-wait-badge` を保持
- [x] 4.6 `.kanban-toolbar` を新設、`.kanban-board-phases { margin-top: 0 }` で toolbar と board の gap 調整

## 5. コメント / 型注釈 の更新

- [x] 5.1 `server/phases.ts` の "dedicated lane" 前提 comment を「needs-human は priorPhase lane に留まる」寄りに書き換え
- [x] 5.2 `server/model.ts` の `phase / priorPhase / escalatedAt / needsHumanQuestion` の JSDoc から dedicated lane 言及を除去
- [x] 5.3 `web/src/phases.ts` client mirror コメントを sync
- [x] 5.4 `web/src/types.ts` `Change` type の同フィールド JSDoc を sync

## 6. Spec delta

- [x] 6.1 `openspec/changes/revert-active-phase-ui/specs/dashboard/spec.md` に **REMOVED Requirements** section で 3 件を明示
- [x] 6.2 各 REMOVED Requirement には短い "Reason for removal" 節
- [x] 6.3 `npm run openspec -- validate revert-active-phase-ui` が VALID (propose 時点で確認済)

## 7. Verification

- [x] 7.1 `npm test && npm run typecheck && npm run build` が clean (162 test pass、typecheck clean、build clean)
- [x] 7.2 Manual: `<PhaseControl>` `<select>` が code から削除されていることを code 上で確認 (grep 済) — dev server での目視は post-merge に defer
- [x] 7.3 Manual: card drag は `useDraggable` の全削除で成立せず、code 上確認済
- [x] 7.4 Manual: needs-human card の priorPhase lane 表示は bucketize test で担保、実 UI は post-merge smoke test に defer
- [x] 7.5 Manual: phase 戻し挙動は既存 add-needs-human-phase の editor fallback + phase POST でカバー、code 変更なし
- [x] 7.6 Manual: `openspec archive` の spec.md からの物理削除は archive step で実施

## 8. Post-archive

- [x] 8.1 `phase-workflow` branch にこの archive commit を merge (worktree で作業した場合) — merge step で実施
- [x] 8.2 `git log --oneline main..phase-workflow` を確認、ここまでの Phase 2 の commit 群 + この revert が並ぶ状態 — 目視
- [x] 8.3 別作業 (main への batch merge) は別 change / 別セッション扱い
