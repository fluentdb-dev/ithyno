---
tags: [revert, kanban, phase-workflow, needs-human, ui]
revert_case: alpha
supersedes_ui_from:
  - openspec/changes/archive/2026-07-05-add-kanban-phase-lanes
  - openspec/changes/archive/2026-07-06-add-needs-human-phase
---

## Why

Phase 2 の landed UI は「User が Kanban 上でカードをドラッグして phase を進める」「needs-human に応答する modal を dashboard に持つ」ことを前提にしていた。

セッション終盤の設計対話で以下 2 点の根本的な取り違えが判明した:

1. **Phase 遷移は User の操作対象ではない** — Manager (Phase 3 で入る `/opsx:apply` の claude session 自身) が phase を自動で書き戻す設計であり、User の interaction は openspec 4-step (propose / apply / archive / merge) だけ
2. **needs-human の Q&A UI は agent 側の役割** — Q&A を dashboard で扱うと agent UI (Claude Code) と二重管理になる。Manager が能動的に PTY session を spawn し通知チェーンで報告する形が正解

背景の完全記録は `docs/2026-07-06-phase-2-implementation-and-redesign.md` に既に落としてある。

## What Changes

**UI 側の manual transition affordances と needs-human 専用 UI をまとめて撤去**する。Backend substrate (phase API / sidecar / needs-human artifact + API / editor fallback) はそのまま残す — Phase 3 の Manager が同じ API を叩く。

### 削除

- `<PhaseControl>` `<select>` component (card head の phase 遷移 dropdown)
- Kanban drag-between-lanes による phase 遷移 (`onDragEnd` の `setChangePhase` call)
- `<NeedsHumanLane>` component (needs-human 専用の full-width strip)
- `bucketize()` の `needsHuman` bucket (needs-human phase の change は `priorPhase` の lane に「badge 付きで」入る)
- `Slot === "needs-human"` を軸にした ChangeCard の分岐 (判定軸を `slot` から `change.phase` へ差し替え)
- 全 card の draggable (`useDraggable({disabled: true})` に統一) と DnD 用の hover class
- Unphased section hint 文言 "Drag a card into a phase lane to opt in." (drag 遷移が無くなるため)
- 4 phase lane header の overlap 応急修正で試みた toolbar 分離は不要になる (drag 削除で PROPOSED header に `+ New Change` を戻せる)、が **Kanban 上部の toolbar 化は保持**する — 別ボタン (`ParallelStartLauncher`) が幅を食うので single lane header より落ち着く

### 保持

- 4 phase lane の Kanban レイアウト (`add-kanban-phase-lanes` の骨格)
- Unphased fallback section
- Progress-Independent Phase Placement の spec
- `<WaitBadge>` component (needs-human phase の change は元 lane に居るが badge で目立たせる)
- Backend の phase API / sidecar / needs-human 一切

### Spec REMOVE (3 件)

`openspec/specs/dashboard/spec.md` から:

- **"Manual Phase Transitions In The UI"** — drag + Phase menu の 2 affordance が User の意思決定を前提にしていた要件
- **"Needs-Human Kanban Lane"** — 専用 swim lane を規定する要件
- **"Escalation User Experience"** — Escalate modal + Answer modal の modal-based UX 要件

### Spec 保持

- Phase Persistence In Change Sidecar
- Phase Transition API
- Kanban Phase Swim Lanes (Manager が動かした結果を表示する要件として活きる)
- Legacy Fallback For Unphased Changes
- Progress-Independent Phase Placement
- Needs-Human Escalation State
- Needs-Human Artifact
- Escalation And Answer API

## Case α revert の妥当性

`add-kanban-phase-lanes` と `add-needs-human-phase` は既に archived 済み。ここでは archived な spec 要件を **REMOVED Requirements** として delta に書き、`openspec archive` 時に `openspec/specs/dashboard/spec.md` から実際に削除する Case α 手続きを踏む。

Retrofit ではなく revert を選ぶ理由:
- 対象要件は「User の interaction 契約」を規定しており、Manager 主導への転換で契約自体が **無効化** する。書き直しではなく取り消しが誠実
- 関連 UI code も物理削除するので spec とコードの整合が保てる

## Blast radius

- `web/src/components/Kanban.tsx` — 約 -180 LOC (`<PhaseControl>` / `<NeedsHumanLane>` / drag→transition / slot-based 分岐の削除、判定軸を `change.phase` へ)
- `web/src/components/Kanban.test.ts` — `bucketize` の needs-human bucket テストを priorPhase lane テストへ差し替え、約 -20 / +30 LOC
- `web/src/styles.css` — 約 -80 LOC (`.kanban-needs-human*`, `.kanban-phase-select`)
- `openspec/specs/dashboard/spec.md` — 約 -120 lines
- コメント修正: `server/phases.ts` / `server/model.ts` / `web/src/phases.ts` / `web/src/types.ts` の "dedicated lane" 前提記述

## Out of scope

- Backend API / sidecar / needs-human artifact / editor fallback — 完全に保持
- Kanban Phase Swim Lanes 要件 — 保持 (Manager が phase を書いた結果を見せる要件として引き続き有効)
- Progress-Independent Phase Placement — 保持
- `.openspec.yaml` に既に書かれた `phase:` 値の migration — 不要 (書式変更なし)
- Phase 3 の Manager loop 実装 — 別 change (`add-runtime-abstraction` から始まる 12 change 分割案)

## Related docs

- `docs/2026-07-06-phase-2-implementation-and-redesign.md` — 実装レビュー結果、reviewer round 1 の 5 件指摘を反映済み
- `docs/2026-07-06-manager-loop-observation-mechanism.md` — 初期 (ithyno-side Manager) の設計、現在は claude=Manager に修正されたが記録として残す
