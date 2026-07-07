## 1. Kanban.tsx — bucketize と judgment axis の再設計

- [ ] 1.1 `Slot` union から `"needs-human"` を削除
- [ ] 1.2 `PhaseBuckets` から `needsHuman` bucket を削除
- [ ] 1.3 `bucketize()` の needs-human 分岐を rewrite: `change.phase === NEEDS_HUMAN` の change は `priorPhase` の lane に振り分け (priorPhase 不明時は proposed)
- [ ] 1.4 `NEEDS_HUMAN` sort 処理 (`.sort(...)`) を削除
- [ ] 1.5 `ChangeCard` の判定軸を `slot` から `change.phase` (と `slot` の progress-only 情報) の 2 軸に:
  - `isNeedsHuman = change.phase === NEEDS_HUMAN`
  - `showReadyDot = slot === "unphased-done"` (progress-derived 保持)
  - `showArchiveInSlot = !isNeedsHuman && (slot === "done" || slot === "unphased-done")`
  - `startEligibleSlot = !isNeedsHuman && slot ∈ {proposed, coded, reviewed, unphased-todo, unphased-inprogress}`
  - `showWaitBadge = isNeedsHuman && change.escalatedAt` (Slot と独立に判定)
  - Question 表示 = `isNeedsHuman && change.needsHumanQuestion`

## 2. Kanban.tsx — UI 部品と drag の撤去

- [ ] 2.1 `<PhaseControl>` component 定義と JSX 使用箇所を削除
- [ ] 2.2 `<NeedsHumanLane>` component 定義と KanbanBoard 内の呼び出しを削除
- [ ] 2.3 `useDraggable({ ... })` の `disabled` を **全 card で true** に (or `useDraggable` 呼び出し自体を削除して `<div>` 直接)
- [ ] 2.4 `onDragEnd` から `setChangePhase` 呼び出しと needs-human 判定を削除、handler 自体を削除して `<DndContext>` も削除 (drop target が無くなる)
- [ ] 2.5 `<PhaseLane>` から `useDroppable` を削除、`isOver` / `over-legal` class 削除
- [ ] 2.6 Kanban 上部 toolbar は保持 (`+ New Change` + `<ParallelStartLauncher>`)。lane header からは onAdd / headerAction props を削除したまま
- [ ] 2.7 `import { setChangePhase } from "../api"` を削除 (呼び出しが無くなるため)
- [ ] 2.8 `<WaitBadge>` を保持し、`ChangeCard` の card head 内で `showWaitBadge` 条件で render
- [ ] 2.9 `<UnphasedSection>` の hint 文言を "Legacy changes without a phase. Manager will opt them in on Phase 3." 相当に更新

## 3. Kanban.test.ts — テストの差し替え

- [ ] 3.1 `"routes needs-human into its own bucket (add-needs-human-phase)"` テストを削除
- [ ] 3.2 `"sorts needs-human by escalatedAt ascending"` テストを削除
- [ ] 3.3 `"falls back to unphased for missing / unknown / reserved phase values"` から `mkChange("needs-human", "needs-human")` ケースを削除
- [ ] 3.4 新規テスト: `"puts needs-human into its priorPhase lane"` — priorPhase=coded の change が `b.coded` に入ることを検証
- [ ] 3.5 新規テスト: `"defaults needs-human to proposed lane when priorPhase is missing"` — priorPhase 未設定の needs-human change が `b.proposed` に入ることを検証
- [ ] 3.6 既存の `"puts known phases into their lanes"` / `"progress-independent"` 系は変更なし

## 4. styles.css — CSS の掃除

- [ ] 4.1 `.kanban-needs-human` および `.empty` variant、`.kanban-needs-human-head`、`.kanban-needs-human-hint`、`.kanban-needs-human-body` を削除
- [ ] 4.2 `.kanban-phase-select` を削除
- [ ] 4.3 `.kanban-card.needs-human` variant を削除 (card head 内の `<WaitBadge>` だけで示せる)
- [ ] 4.4 `.kanban-card-question` は保持 (needs-human の question 表示に使う)
- [ ] 4.5 `.kanban-wait-badge` は保持
- [ ] 4.6 Kanban 上部 toolbar 用の `.kanban-toolbar` / `.kanban-board-phases` `margin-top: 0` は追加 (toolbar 分離を revert に含めるため)

## 5. コメント / 型注釈 の更新

- [ ] 5.1 `server/phases.ts:6-14, 20-22` の "dedicated lane" 前提 comment を「Manager 経由の需給専用 phase value」寄りに書き換え
- [ ] 5.2 `server/model.ts:44-50` の `phase / priorPhase / escalatedAt / needsHumanQuestion` の JSDoc から dedicated lane 言及を除去、代わりに「Card badge に使う」と明記
- [ ] 5.3 `web/src/phases.ts:4-7` client mirror コメントを sync
- [ ] 5.4 `web/src/types.ts:35-48` `Change` type の同フィールド JSDoc を sync

## 6. Spec delta

- [ ] 6.1 `openspec/changes/revert-active-phase-ui/specs/dashboard/spec.md` に **REMOVED Requirements** section で 3 件を明示:
  - Manual Phase Transitions In The UI
  - Needs-Human Kanban Lane
  - Escalation User Experience
- [ ] 6.2 各 REMOVED Requirement には短い "Reason" 節: Manager (Phase 3) が phase を自動遷移させる設計への転換 / needs-human Q&A は agent UI が担当
- [ ] 6.3 `npm run openspec -- validate revert-active-phase-ui` が VALID を返す

## 7. Verification

- [ ] 7.1 `npm test && npm run typecheck && npm run build` が clean
- [ ] 7.2 Manual: dev server 起動、Kanban に `<PhaseControl>` `<select>` が存在しないことを目視
- [ ] 7.3 Manual: card ドラッグを試して no-op (drop されない or 動かない) を確認
- [ ] 7.4 Manual: `curl -X POST /api/changes/<id>/phase -d '{"phase":"needs-human"}'` で API 経由で phase 変化させ、対象 change が **priorPhase の lane** (or priorPhase 無ければ proposed lane) に card badge (`<WaitBadge>` + question 表示) 付きで表示されることを確認
- [ ] 7.5 Manual: 上記 card から phase を戻す API 呼び出しをして、badge が消え、通常表示に戻ることを確認
- [ ] 7.6 Manual: `openspec archive revert-active-phase-ui --yes` 時に `openspec/specs/dashboard/spec.md` から 3 要件が **物理的に削除される** ことを確認

## 8. Post-archive

- [ ] 8.1 `phase-workflow` branch にこの archive commit を merge (worktree で作業した場合)
- [ ] 8.2 `git log --oneline main..phase-workflow` を確認、ここまでの Phase 2 の commit 群 + この revert が並ぶ状態
- [ ] 8.3 別作業 (main への batch merge) は別 change / 別セッション扱い
