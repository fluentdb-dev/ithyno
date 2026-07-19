---
title: Phase 2 実装レビュー用 — 実装内容と Manager-first 再設計
date: 2026-07-06
status: review-round-1-applied
audience: 別 agent によるレビュー
supersedes: (見直し対象) openspec/changes/archive/2026-07-05-add-kanban-phase-lanes, openspec/changes/archive/2026-07-06-add-needs-human-phase の UI 部分
review_rounds:
  - date: 2026-07-06
    reviewer: 別 agent (session 内)
    outcome: 5 件指摘 (High 2 / Medium 2 / Low 1) — 全件受け入れ、本 doc に反映済み。詳細は §12
tags: [phase-workflow, kanban, manager, agents, escalation]
---

# Phase 2 実装レビュー用ドキュメント

このドキュメントは、2026-07-04〜07-06 に実施した **ithyno Phase 2 実装** の結果と、その後の設計対話で判明した **モデル的な取り違え**、および **修正方針** をまとめたもの。別 agent が読み、以下を判断できることを目的とする:

1. Phase 2 で landed した substrate はそのまま活かせるか
2. UI 側の revert (`revert-active-phase-ui` として起こす予定) の方針は妥当か
3. Phase 3 に向けた **Manager-first** モデルと **Agents タブ拡張** の方向は妥当か
4. 見逃している矛盾 / 反例はないか

## 1. 前提

- 対象ブランチ: `phase-workflow` (main から 11 commits 先行、未 merge)
- 対象 change (archived on phase-workflow):
  - `add-phase-state-machine` (prior session)
  - `add-kanban-phase-lanes`
  - `add-needs-human-phase` (partial — modals descoped)
  - `add-sidecar-tests` (test-only、proposal 省略)
- 追加テスト: 129 → 161 (32 個増)、typecheck / build clean

## 2. Phase 2 の当初計画 (今回セッション開始時)

先行 change (`add-phase-state-machine`) が backend substrate だけ landed し、UI (swim lane / 手動遷移) は deferred の状態だった。それを引き継いで:

1. `add-kanban-phase-lanes` — 4 phase lane + Unphased fallback + drag-between-lanes
2. `add-needs-human-phase` — escalation state + 専用 lane + modal (UX)
3. `add-sidecar-tests` — sidecar module の unit test
4. `phase-workflow` → `main` にまとめて merge

いずれも「Kanban 上で user がカードを動かして phase を進める」ことを前提としていた。

## 3. 実装した内容

### 3.1 Backend substrate (残すべき — 正しい方向)

| 場所 | 内容 | 状態 |
|---|---|---|
| `server/phases.ts` | `PHASES` / `NEEDS_HUMAN` / `RESERVED_PHASES` / `isPhase` / `isPersistedPhase` | ✅ |
| `server/sidecar.ts` | `readSidecar` / `writeSidecar` / `extractSidecarFields` (undefined-in-patch で key 削除、`priorPhase` / `escalatedAt` の invariant 適用) | ✅ |
| `server/needs-human.ts` | `needs-human.md` の render / parse / appendAnswer | ✅ |
| `server/index.ts` | `GET/POST /api/changes/:id/phase`、`POST /api/changes/:id/needs-human`、`POST /api/changes/:id/needs-human/answer`、editor fallback の chokidar hook | ✅ |
| `server/parser/workspace.ts` | sidecar → Change payload、`needsHumanQuestion` を needs-human 時のみ surface | ✅ |
| `server/model.ts` | Change type に `phase / priorPhase / escalatedAt / needsHumanQuestion` | ✅ |
| `server/sync/watcher.ts` | `.md` に加え `.openspec.yaml` を tracked に | ✅ |
| Tests | `server/sidecar.test.ts` (17)、`server/needs-human.test.ts` (5)、`server/agents/pool.integration.test.ts` (Phase 1 由来 7) など計 161 | ✅ |

**再設計後もこれらは全部生きる**。Manager は同じ API を叩き、同じ sidecar フォーマットに書き、同じ artifact スキーマを使う。

### 3.2 Kanban UI (要 revert — 誤設計)

| 場所 | 内容 | 状態 |
|---|---|---|
| `web/src/components/Kanban.tsx` | `bucketize()` が phase-first に、4 `<PhaseLane>` + `<UnphasedSection>` + `<NeedsHumanLane>` を描画 | ❌ 過剰 |
| 同 | `<PhaseControl>` `<select>` を card head に配置 (secondary transition affordance) | ❌ 削除対象 |
| 同 | drag-between-lanes → `setChangePhase` API call | ❌ 削除対象 |
| 同 | `<WaitBadge>` (needs-human 待ち時間表示) | ✅ 残す (badge として card head へ) |
| `web/src/styles.css` | 4-column phase grid / dashed Unphased / accent Needs-Human strip | ⚠️ 一部残 (Unphased / phase grid は残る、Needs-Human strip は削除) |
| `web/src/api.ts` | `setChangePhase` / `escalateChange` / `answerEscalation` | ⚠️ user から呼ばない (Manager から呼ぶ形に用途変更) |

### 3.3 表示崩れの応急修正 (未 commit・要判断)

セッション終盤、user 手元での表示崩れを 2 点修正した (未 commit):

- **PROPOSED lane header で `+ New Change` と `<ParallelStartLauncher>` が overlap** → board 上部の toolbar に切り出し
- **`<select>` を `<Link>` の中に入れており Firefox が dropdown click で navigate** → head を Link 外に出し、id 部分だけ Link にする (nested interactive element 回避)
- **NEEDS HUMAN empty state の contrast 不足** → `--panel-2` に寄せて視認性 up

**revert 後は上記 3 点いずれも意味を失う** (`<PhaseControl>` 削除で 2 番目は moot、Needs-Human strip 削除で 3 番目も moot、toolbar 切り出しだけ独立で有効)。

## 4. 設計上の取り違え

セッション終盤の対話で、以下の 2 つの根本的な取り違えが判明した。

### 4.1 「Kanban で user がカードを動かして phase を進める」は誤り

**正しい 2 層構造**:

```
User 層 (openspec 4-step)
   propose → apply → archive → merge
       │        │        │        │
       └── delegate ─────┘
                │
                ▼
Manager 層 (agent 主導、user は見るだけ)
   proposed → coded → reviewed → done
       │
       └── needs-human ─── (agent UI で完結)
```

- User は openspec 4-step (`propose` / `apply` / `archive` / `merge`) だけ触る
- Phase 遷移 (`proposed → coded → reviewed → done`) は Phase 3+ で入る **Manager agent** が自動で書く
- Ithyno の Kanban は Manager が動かした結果を可視化する **state monitor** であり、控制盘ではない

したがって:
- `<PhaseControl>` `<select>` は **不要** (user が phase を触る必要がない)
- drag-between-lanes → phase 遷移 は **不要** (同上)
- Phase 2 の spec 要件 "Manual Phase Transitions In The UI" は **REMOVE 対象**

### 4.2 「needs-human の Q&A を ithyno で回答する」も誤り

- Escalation の Q&A UI は **Claude Code (agent UI) の役割**、ithyno に modal を作るのは二重管理
- Ithyno は「この change が人待ちである」というステータス badge を出すだけで十分
- 詰まった agent との会話は Claude Code の PTY で完結し、agent が exit する際に phase を書き戻す

したがって:
- `<NeedsHumanLane>` (専用 lane) は **不要** — badge を card head に付ければ足りる
- Escalation modal / Answer modal は **元々未実装** → **もう作らない**
- Phase 2 の spec 要件 "Needs-Human Kanban Lane" と "Escalation User Experience" は **REMOVE 対象**
- Phase 2 spec 要件 "Escalation And Answer API" は Manager と editor fallback が使うので残す

## 5. 修正方針

以下を openspec change として起こす予定 (task #81-#83 に登録済み):

### 5.1 `revert-active-phase-ui` (Case α revert — 2 archived change の一部を戻す)

> **注**: 初版の blast radius 見積もりは狭かった。レビュー指摘 #2, #3 に沿って拡張済み。

#### 削除する code (拡張版)

- **`web/src/components/Kanban.tsx`**
  - `<PhaseControl>` component 削除
  - `<NeedsHumanLane>` component 削除
  - `onDragEnd` の `setChangePhase` 呼び出し削除
  - 全 card の draggable を false に (`useDraggable({disabled: true})`)
  - **`bucketize()` 再設計** (指摘 #1): `needsHuman` bucket を消すだけでは needs-human phase の change が `unphased` に落ちる。`priorPhase` を見て「本来入るべき lane」を再計算する必要あり。詳細は §5.2 参照
  - **`ChangeCard` の判定軸を `slot` から `change.phase` ベースへ組み替え** (指摘 #2): 詳細は §5.2 参照
  - `<WaitBadge>` は残し、`change.phase === "needs-human"` の card head に条件付き配置
  - `DndContext` / `useDroppable` (phase lane 用) 削除
  - hover class (`.over-legal` / `.over-blocked`) 関連 code 削除
  - Unphased section の hint 文言変更 (`"Legacy changes without a phase. Drag a card into a phase lane to opt in."` → `"Legacy changes without a phase. Manager will opt them in on Phase 3."` 等) — `web/src/components/Kanban.tsx:423` (指摘 #3)

- **`web/src/components/Kanban.test.ts`** (指摘 #3)
  - `"routes needs-human into its own bucket (add-needs-human-phase)"` テスト削除
  - `"sorts needs-human by escalatedAt ascending"` テスト削除
  - 代わりに「needs-human の change は `priorPhase` の lane に入る」テスト追加
  - `"falls back to unphased for missing / unknown / reserved phase values"` の needs-human ケース修正
  - 参照: `web/src/components/Kanban.test.ts:74-90`

- **`web/src/styles.css`**
  - `.kanban-needs-human*` 削除
  - `.kanban-phase-select` 削除
  - `.kanban-card-question` は残す (badge の question 表示に流用)
  - `.kanban-wait-badge` は残す

- **`web/src/api.ts`**
  - `setChangePhase` / `escalateChange` / `answerEscalation` は残す (Manager と editor fallback が使う) が、UI からの呼び出しは削除

- **コメント類の更新** (指摘 #3): "dedicated lane" 前提の記述を修正
  - `server/phases.ts:6-14, 20-22` (needs-human の説明)
  - `server/model.ts:48-54` (Change 型の priorPhase / escalatedAt / needsHumanQuestion コメント)
  - `web/src/phases.ts:4-7`
  - `web/src/types.ts:35-48`

#### 削除する spec 要件 (`openspec/specs/dashboard/spec.md` から)
- "Manual Phase Transitions In The UI" (add-phase-state-machine 由来)
- "Needs-Human Kanban Lane" (add-needs-human-phase 由来)
- "Escalation User Experience" (add-needs-human-phase 由来)

#### 保持する spec 要件
- "Phase Persistence In Change Sidecar"
- "Phase Transition API"
- "Kanban Phase Swim Lanes" (Manager が動かした結果を見せる)
- "Legacy Fallback For Unphased Changes"
- "Progress-Independent Phase Placement"
- "Needs-Human Escalation State"
- "Needs-Human Artifact"
- "Escalation And Answer API"

#### Blast radius (再計算)
- `Kanban.tsx` 約 -180 LOC (bucketize 再設計 + ChangeCard 判定軸差し替え含む)
- `Kanban.test.ts` 約 -20 / +30 LOC (差し引きは軽微、意味論は大きく変わる)
- `styles.css` 約 -80 LOC
- `spec.md` 約 -120 lines
- コメント修正: 5 ファイル × 数行ずつ

### 5.2 needs-human 表示の再アーキテクチャ (指摘 #1, #2 対応)

現行実装は、needs-human を **専用 bucket + 専用 slot** で扱っており、削除だけでは矛盾する。

#### 現行の依存関係
```
bucketize(changes)
  → needsHuman bucket に振り分け

NeedsHumanLane
  → bucket を map して renderCard(c, "needs-human")

ChangeCard(props.slot === "needs-human")
  → 待機 badge 表示 (web/src/components/Kanban.tsx:507-546, 657-667)
  → 質問文表示  (同上)
  → drag 無効化 (web/src/components/Kanban.tsx:480-486)
  → Start / Archive を非表示 (web/src/components/Kanban.tsx:491-505, 560-600)
```

`slot` は「どの lane に render されているか」を表す。needs-human 専用 lane が消えると `slot === "needs-human"` は成立しない。

#### 再設計案: 判定軸を `slot` → `change.phase` に切り替え

**bucketize の変更**
```typescript
function bucketize(changes: Change[]): PhaseBuckets {
  // ...
  for (const c of changes) {
    if (c.phase === NEEDS_HUMAN) {
      // needs-human の change は priorPhase の lane に「badge 付きで」入る。
      // priorPhase が無い場合は proposed (server 側 default と同じ)。
      const target = isPhase(c.priorPhase) ? c.priorPhase : "proposed";
      b[target].push(c);
    } else if (isPhase(c.phase)) {
      b[c.phase].push(c);
    } else {
      b.unphased.push(c);
    }
  }
  // 元 lane で escalatedAt 昇順に並べたい場合は phase 別 sort が必要
  return b;
}
```

**ChangeCard の判定軸の切り替え**  
`slot` を「badge / button 表示の decisionmaker」から外し、`change.phase` を第一の判定軸にする:

```typescript
const isNeedsHuman = change.phase === NEEDS_HUMAN;

// draggable: 全 lane で false (revert 済み方針)
useDraggable({disabled: true});

// 待機 badge: phase-based
{isNeedsHuman && change.escalatedAt && <WaitBadge .../>}

// 質問表示: phase-based (intent の代わり)
{isNeedsHuman && change.needsHumanQuestion
  ? <p className="kanban-card-question">{change.needsHumanQuestion}</p>
  : change.proposal?.intent && <p className="kanban-card-intent">...</p>}

// Start ボタン: needs-human は不可
const showStartArea = hasAgents && !job && !isNeedsHuman &&
  slot !== "done" && slot !== "unphased-done";

// Archive ボタン: needs-human は不可
const showArchiveInSlot = !isNeedsHuman &&
  (slot === "done" || slot === "unphased-done");

// ready dot: 変化なし (progress-derived)
const showReadyDot = slot === "unphased-done";
```

**`slot` の役割縮小**: 「どこに描画されているか」の情報だけ持ち、button 出し分けは phase を優先。`slot === "unphased-done"` の progress-derived 判定は残す (Unphased section 内の localism)。

#### Test 修正

`web/src/components/Kanban.test.ts` の needs-human ケース (`:74-90`) を差し替え:

```typescript
it("puts needs-human into its priorPhase lane with a badge marker", () => {
  const c = mkChange("escalated", "needs-human");
  (c as any).priorPhase = "coded";
  (c as any).escalatedAt = "2026-07-05T10:00:00Z";
  const b = bucketize([c]);
  expect(b.coded.map(x => x.id)).toEqual(["escalated"]);
  expect(b.unphased).toEqual([]);
});

it("defaults to proposed when needs-human has no priorPhase", () => {
  const c = mkChange("escalated-no-prior", "needs-human");
  const b = bucketize([c]);
  expect(b.proposed.map(x => x.id)).toEqual(["escalated-no-prior"]);
});
```

`"sorts needs-human by escalatedAt ascending"` は用途が変わる (元 lane 内での sort 挙動を検証) ので、そのまま消すか **lane 内 sort** に書き直す必要あり。sort を諦めて "順序未定" とする選択肢もある — このドキュメントでは決めず、レビュー観点 §10-b に上げる。

### 5.3 `extend-agents-tab` の前提条件 (指摘 #4 対応)

現状の `JobSummary` / `AgentPublic` / `Agents.tsx` は Output / Diff の 2 tab 前提で書かれており、そのままでは Verdict / Artifact / Manager state を載せられない。UI 拡張の前に **サーバー側モデル拡張が必要**。

#### 型拡張が必要なもの (現行)

- `web/src/types.ts:155-187` の `JobSummary`  
  - 追加: `verdict?: { kind: "pass" | "needs-rework" | "unknown"; summary?: string; findings?: Finding[] }`
  - 追加: `artifacts?: { review?: string; needsHuman?: string }` (artifact ファイルパスの列挙)
  - 追加: `role: "apply" | "code-review" | "verify" | "manager" | string` — 既に `agents.yaml` にはあるが Job には落ちていない

- サーバー側 `server/model.ts` の Job 型 (該当箇所を見て同期)
- `AgentPublic` — role が publicConfig に載っているか確認、載っていなければ追加

#### 新規 endpoint

- `GET /api/agents/jobs/:id/verdict` — 構造化 verdict JSON
- `GET /api/agents/jobs/:id/artifact?type=review|needs-human` — raw content
- `GET /api/agents/manager` — Manager 状態 + 最近の dispatch 履歴 (Phase 3 で入る Manager loop 実装後)

#### 現行 UI の状態

- `web/src/pages/Agents.tsx:21-23` — state 型が `stdout` / `diff` の union
- `web/src/pages/Agents.tsx:89-147` — tab render で 2 tab を hard code

**分割案** (指摘 #4 対応):

1. **`extend-agent-job-model`** — サーバー側 JobSummary に role / verdict / artifacts を追加、endpoint 増設。UI は変えない。
2. **`extend-agents-tab-tabs`** — UI 側で Overview / Verdict / stdout / Diff / Artifact tab を実装。model 側が整ってから。
3. **`add-agents-tab-filters`** — role / status / change filter UI。
4. **`add-manager-loop`** — Manager 常駐 process + dispatch 実装 (Phase 3 core)。
5. **`add-agents-tab-manager-panel`** — Manager pinned entry。4 の副産物。
6. **`add-deep-link-to-claude-code`** — needs-human 用 [Open in Claude Code] ボタン。

1〜3 は Manager が居なくても意味がある (既存の Start 経由の code-review agent でも valid)。4 が Phase 3 core。5〜6 は 4 の副産物。

### 5.2 `extend-agents-tab` (Phase 3 準備)

- Job list に role / status / change フィルタ
- Job detail に Overview / Verdict / stdout / Diff / Artifact の 5 tab
- Manager 状態 pinned entry
- needs-human 状態の job には `[Open in Claude Code]` deep link ボタン

詳細は §7 参照。

## 6. 完成後 UI (要点)

### Kanban (Overview)

```
┌────────────────────────────────────────────────────────┐
│ 23 active changes  ▰▰▰▰▰▰▱▱  246/511 · 48%           │
│                                       [+ New Change]  │
│                                                        │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │
│ │PROPOSED│ │ CODED  │ │REVIEWED│ │  DONE  │          │
│ │[Apply] │ │        │ │        │ │[Archiv]│          │
│ │  card  │ │  card  │ │  card  │ │[Merge] │          │
│ │  card  │ │        │ │        │ │  card  │          │
│ └────────┘ └────────┘ └────────┘ └────────┘          │
│                                                        │
│ ┌────────────────────────────────────────────────────┐│
│ │ UNPHASED (23)  Legacy — drag への UI 無し          ││
│ │ [todo bucket] [in-progress bucket] [done bucket]   ││
│ └────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

- 全 card **ドラッグ不可** (`<PhaseControl>` 無し、drag→phase transition 無し)
- 各 card head に **needs-human badge** (`⚠ 42m` 等)、クリックで Agents タブへ jump
- PROPOSED の card には `[Apply]` 、DONE の card には `[Archive]` / `[Merge]` (既存 button)
- Unphased section は legacy として残す (Manager 未対応の change 用)

### Agents タブ (拡張後)

```
┌─────────────────────────────────────────────────────────────┐
│ [Filter: All | Running | Waiting-Human | Done | Failed]    │
│ [Role: All | apply | code-review | verify | manager]       │
│ [Change: All | add-foo | add-bar | …]                      │
│                                                             │
│ ┌──────────────────┬─────────────────────────────────────┐ │
│ │ 🕒 manager       │ ┌ Overview | Verdict | stdout | ... ┐│ │
│ │   idle           │ │                                   ││ │
│ │                  │ │ agent: review-claude              ││ │
│ │ ● impl-claude    │ │ role:  code-review                ││ │
│ │   add-foo · 3m   │ │ change: add-foo @ coded           ││ │
│ │                  │ │ verdict: needs-rework             ││ │
│ │ ✓ review-claude  │ │  → triggered impl-claude at 15:37 ││ │
│ │   add-foo pass   │ │                                   ││ │
│ │                  │ └───────────────────────────────────┘│ │
│ │ ⚠ review-claude  │                                      │ │
│ │   add-bar rework │                                      │ │
│ │                  │                                      │ │
│ │ 🚨 impl-claude   │                                      │ │
│ │   add-baz 42m    │                                      │ │
│ │   [Open Claude]  │                                      │ │
│ └──────────────────┴─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 7. Phase 3 に向けた agents.yaml スキーマ拡張

現状 (Phase 1 で landed):

```yaml
agents:
  - name: claude
    role: apply
    specialties: [any]
    dedicated: false
    args: [--dangerously-skip-permissions, -p, /ithy-opsx:apply ${change_id}]
```

Phase 3 で追加したいフィールド (**別 change として提案予定**):

```yaml
worktreePool:
  max: 5

agents:
  - name: impl-claude
    role: apply
    specialties: [any]
    dedicated: false
    trigger:
      onPhase: proposed           # 新: この phase 遷移で Manager が dispatch
    args: [-p, "/ithy-opsx:apply ${change_id}"]
    onSuccess:
      setPhase: coded             # 新: 成功で phase を書き戻す
    onFailure:
      setPhase: needs-human
      writeArtifact: needs-human.md

  - name: review-claude
    role: code-review
    specialties: [ts, react]
    dedicated: false
    trigger:
      onPhase: coded
    args: [-p, "/opsx:review ${change_id} --format=json"]
    onSuccess:
      setPhase: reviewed
      writeArtifact: review.md
    onNeedsRework:
      setPhase: coded
      writeArtifact: review.md

  - name: verify-claude
    role: verify
    trigger:
      onPhase: reviewed
    args: [-p, "/opsx:verify ${change_id}"]
    onSuccess:
      setPhase: done

  - name: manager
    role: manager
    dedicated: true
    trigger:
      onServerStart: true         # 常駐 process
    args: [-p, "/opsx:manager"]
```

Manager が `trigger.onPhase` を watch → 該当 change に対して agent を dispatch → runner が `onSuccess` / `onFailure` に沿って phase 書き戻し。既存の `-p` 実行モードはそのまま (Manager は上流の dispatch を、runner は下流の phase 書き戻しを担当)。

## 8. 既存 `-p` 実行との差異

| 側面 | Phase 1 (現状) | Phase 3 (Manager-first) |
|---|---|---|
| Job 起動 | user が Start ボタンを押す | Manager が `trigger.onPhase` に沿って自動 dispatch |
| Agent 数 | 1 (`claude`) | N (`impl-claude` / `review-claude` / `verify-claude` / `manager`) |
| 成果物 | git commit のみ | git commit + `review.md` / `needs-human.md` の構造化 artifact |
| Phase 書き込み | 手動 (現状は select、revert 後は無し) | `onSuccess` / `onFailure` の宣言に沿って runner が自動書き込み |
| Q&A | 現状 needs-human は dashboard モーダル (私が誤設計) → revert 後は Claude Code の PTY で完結 | 同左 |
| 内部 Claude 起動 | `-p` mode | **同じ** `-p` mode。何も変わらない |

**要点**: `-p` の呼び出し方は Phase 3 でも一切変わらない。変わるのは「誰がいつ叩くか」と「結果をどう解釈するか」の外側だけ。

## 9. 未 commit の状態 (整理・レビュー時点で更新)

現在 branch `phase-workflow` は以下の状態:

```
b5ea979 test: add sidecar unit tests
57dbf34 archive: add-needs-human-phase (partial impl — modals deferred)
5333230 merge: add-needs-human-phase into phase-workflow
207bb7b impl: add-needs-human-phase
9ecac71 archive: add-kanban-phase-lanes
76a1d47 merge: add-kanban-phase-lanes into phase-workflow
3e4a60f impl: add-kanban-phase-lanes
602f0a5 propose: add-kanban-phase-lanes
f6ca7eb archive: add-phase-state-machine (prior session)
```

- `main` から **11 commits 先行 / 未 merge**

- **Modified** (未 commit):
  - `agents.yaml` — worktreePool 設定 (Phase 1 由来、この session では触っていない)
  - `web/src/components/Kanban.tsx` — 表示崩れ応急修正 (toolbar 分離、head を Link 外に)
  - `web/src/styles.css` — 同上

- **Untracked** (未追跡):
  - `docs/2026-07-06-phase-2-implementation-and-redesign.md` — 本ドキュメント
  - `Screenshot 2026-07-06 at 17-31-09 ithyno.png` — user 提供のスクショ (崩れ症状)
  - `Screenshot 2026-07-06 at 17.36.56.png` — 同上
  - `docs/ideas/2026-07-02-electron-launch-screen.md` (別 session)
  - `docs/ideas/2026-07-04-phase-gates-and-putback.md` (add-phase-state-machine で参照)
  - `icon.png`
  - `openspec/changes/add-agent-process-detach/.openspec.yaml` (別 session の残骸)
  - `openspec/changes/add-git-remote-panel/` (別 session の下書き)

- **応急修正の commit 判断**: `revert-active-phase-ui` で `<PhaseControl>` を丸ごと削除する予定なので、`<select>` を Link 外に出す修正は revert 先取り。toolbar 分離だけは revert 後も残るので、切り出して `fix: kanban toolbar overflow` として先に commit する選択肢あり。判断はレビュー観点 §10-11 に上げる。

## 10. 別 agent へのレビュー観点

以下について、反例 / 見落とし / better idea があれば指摘してほしい:

1. **Manager 前提の妥当性**  
   - Manager が Phase 3 で入る前提だが、それまで phase 遷移が凍る (change は proposed か Unphased に沈殿する)。この期間は「Kanban は将来のための空箱」になる。それでも substrate を先に landing することの妥当性は?

2. **Case α revert の正当性**  
   - archived 済み change の spec を後から REMOVE することは openspec のワークフロー的に許容範囲か。retrofit で書き直す方が誠実か?

3. **Unphased section の存続理由**  
   - Manager が全 change を phase system に opt-in させれば Unphased section は unused になる。それでも legacy 保護のために残す判断は正しいか。あるいはこの時点で phased-only 前提の Kanban に振り切るべきか?

4. **needs-human.md artifact の要否**  
   - Q&A UI を ithyno から外す前提だと、artifact は audit trail 以外の役割を失う。それでも editor fallback (chokidar) のために必須。この二重目的の設計は妥当か。

5. **`review.md` artifact スキーマ**  
   - まだ未定義。JSON にすべきか frontmatter+markdown にすべきか。既存の `outcome.md` / `needs-human.md` は markdown で揃えているので、`review.md` も同じ流儀が良いか。

6. **Manager の実装形態**  
   - Fastify server と同居する常駐 process か、独立 process か、`claude -p` の long-running instance か。Restart 耐性 / observability / debug しやすさで選び分け。

7. **Agents タブ拡張の filter 粒度**  
   - status / role / change の 3 段で足りるか。時系列 / 特定 agent 名 / verdict などの追加軸は必要か。

8. **既存 Start ボタンと Manager の共存**  
   - Manager が居ても user は Start ボタンで Impl agent を叩けるべきか (debug / 特殊ケース)、それとも封じるべきか。共存させると "誰が phase を進めるか" の責任が分散する。

9. **openspec 4-step の "apply" の意味**  
   - `/opsx:apply` は現状「Claude が tasks を実行して git commit する」だが、Manager 前提だと「Manager に処理を委譲する」ように意味が広がる。既存 skill (`ithy-opsx-apply`) との整合はどう取るか。

10. **`revert-active-phase-ui` の粒度**  
    - `revert-manual-phase-transitions` + `reduce-needs-human-ui` の 2 件に分けるべきか、1 件にまとめるべきか。§5.2 の needs-human 再アーキテクチャは両方に触るので依存が強い。1 件推奨だが確認。

11. **needs-human の元 lane 内 sort (指摘 #2 派生)**  
    - lane 内で escalatedAt 順に前寄せするか (最古参が top)、通常の change と混在させて sort 順は成り行きとするか。前者だと card 順序が動的に変わるので UX にノイズ、後者だと存在が埋もれる。badge が十分視認できるかどうかの判断が必要。

12. **応急修正の切り出し (指摘 #5 派生)**  
    - `<select>` を Link 外に出す修正は revert 先取り = 破棄可能。toolbar 分離は revert 後も残る。この 2 つを 1 commit にせず、`fix: kanban toolbar overflow` として先に commit + push、Kanban.tsx の残りは revert に含める方が clean。判断求む。

## 11. 想定される次のアクション

セッションでの合意事項 (レビュー結果反映後):

1. 応急修正のうち toolbar 分離だけ切り出し commit (§10-12 の判断次第)
2. `revert-active-phase-ui` の propose と実装 (§5.1 + §5.2 の拡張 scope で)
3. `phase-workflow` → `main` の batch merge (Phase 2 substrate デリバリー確定)
4. `extend-agent-job-model` の propose (§5.3 の分割案の #1、Agents タブ拡張の前提)
5. `extend-agents-tab-tabs` / `add-agents-tab-filters` (§5.3 分割案の #2, #3)
6. `add-manager-loop` / `add-role-based-agent-dispatch` / `add-review-artifact` の順で Phase 3 へ

## 12. レビュー履歴

### Round 1 (2026-07-06)

別 agent (session 内) による机上レビュー。5 件指摘、全件受け入れ:

| # | 深刻度 | 指摘 | 反映先 |
|---|---|---|---|
| 1 | High | `bucketize()` で `needsHuman` bucket を消すだけでは needs-human 変更が `unphased` に落ちる。`priorPhase` ベースの再計算が必要 | §5.1 (削除 code の bucketize 項)、§5.2 全体 |
| 2 | High | 元 lane に戻すと `slot === "needs-human"` 前提の待機 badge / 質問表示 / drag 無効化が消え、Start / Archive が誤って出る。判定軸を `slot` から `change.phase` へ差し替え必要 | §5.2 (ChangeCard 判定軸差し替え)、§10-11 (lane 内 sort 判断) |
| 3 | Medium | `revert-active-phase-ui` の blast radius が拡大: test / Unphased 文言 / コメント類 / DnD 周りも直る | §5.1 (削除 code / test 項の展開)、§5.1 (Blast radius 再計算) |
| 4 | Medium | Agents タブ拡張は現行 `JobSummary` / `AgentPublic` / `Agents.tsx` の shape で載らない。サーバー側 model 拡張が先 | §5.3 (前提条件セクション新設、分割案 6 段階) |
| 5 | Low | §9 の dirty tree 記述がずれ (`agents.yaml` は modified、スクショ 2 枚は untracked) | §9 全面更新 |

**残っている論点** (レビュー agent が指摘していないが要確認):
- Manager 実装形態 (常駐 process か independent か) — §10-6
- `review.md` の schema (JSON vs frontmatter+markdown) — §10-5
- Case α revert の openspec ワークフロー的妥当性 — §10-2

以上。
