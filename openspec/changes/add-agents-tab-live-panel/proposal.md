---
tags: [phase-5, agents-tab, ui, observability, area/web]
phase: 5
milestone: 観測 UI
sequence: 1
depends_on:
  - add-runtime-abstraction
  - add-runtime-detection
  - extend-agent-job-model
enables:
  - add-agents-config-ui
  - add-agents-config-write
---

## Why

Phase 3 で agent runtime abstraction / dispatch endpoint / runtime
detection / Job model 拡張 (role / runtime / verdict / artifacts) が
landed した。**Agents タブは これらの情報をまだ表示していない**:

- 現行の "Configured agents" は agent 名と `command args` を並べる
  だけ。role / runtime を出していない
- 実行中と完了の分離はあるが、**runtime label** (claude / aider /
  legacy) や **role** の badge がない
- **Runtimes 一覧** (Phase 3.3 の `GET /api/agents/runtimes` endpoint) が
  UI 側で使われていない
- **Verdict** (Phase 3.5 の review 結果) が完了 job に表示されない

Phase 5.1 で Agents タブを **agent-fleet 観測画面**として再構成する。
用途は「どの agent が今動いているか / どんな設定か / どの runtime が
installed か」の 3 点。change に踏み込んだ表示 (per-change diff etc.) は
既存の Kanban / Change 詳細ページに委譲、Agents タブは fleet-centric。

## What Changes

### 1. Agents タブを 4 section に再構成

```
Agents タブ
├── Runtimes           (Phase 3.3 endpoint from GET /api/agents/runtimes)
├── Live               (running jobs、role/runtime badge 付き)
├── Configured (idle)  (agents.yaml declared だが running でない agent)
└── Recent jobs        (最近完了した job、既存の drill-in を保持)
```

### 2. Runtimes section

`GET /api/agents/runtimes` を fetch し、以下を表示:

```
▼ Runtimes (3 declared, 2 installed)
  ✓ claude    installed  · interactive: yes  · artifact: yes  · diff: git
  ✓ aider     installed  · interactive: no   · artifact: yes  · diff: aider-native
  ○ copilot   not found  — install via `brew install gh && gh extension install github/gh-copilot`
```

- Runtime 定義が 0 のとき: hide section entirely
- `?refresh=1` 相当の手動 refresh ボタン (endpoint 側は既に対応済)

### 3. Live section

現行 "Active jobs" を rename + 拡張:

```
▼ Live (2 running)
  ● impl-claude · code (claude) · working on add-foo · 3m 12s · [Cancel]
  ● review-claude · review (claude) · working on add-foo · 45s
```

- Job model の `role` / `runtime` (Phase 3.4 で追加) を badge 表示
- 既存 drill-in (Output / Diff tab) は保持

### 4. Configured (idle) section

現行 "Configured agents" を rename + 拡張:

```
▼ Configured (idle) (3 agents)
  code-claude    · code   · runtime: claude · specialties: [any]
  review-claude  · review · runtime: claude
  verify-claude  · verify · runtime: claude
```

- Currently running な agent はここから除外 (重複しない)
- role / runtime を表示 (agents.yaml が runtime-backed shape の場合)
- Legacy shape (command + args) の agent は `runtime: legacy` として表示

### 5. Recent jobs section

現行 "Recent jobs" を維持。追加:

- 完了 job にも role / runtime badge 表示
- **Verdict badge** (Phase 3.5) を表示: `verdict: pass ✓` / `verdict: needs-rework (2)` / undefined 時は non-display

### 6. Store / API

新規:

- `web/src/api.ts` の `fetchAgentRuntimes(refresh?: boolean): Promise<RuntimeStatusResponse>`
- Store に `runtimes` state を追加、`loadRuntimes()` action

初期 fetch: Agents タブが mount 時に 1 回。手動 refresh ボタンで再取得。

### 7. CSS

新規:
- `.runtime-row` (installed / not-installed で色分け)
- `.job-role-badge` `.job-runtime-badge` (Live / Recent で共通)
- `.job-verdict-badge` (pass = green、needs-rework = amber)

## Out of scope

- **Config editor** — Phase 5.2 `add-agents-config-ui`
- **Config write** — Phase 5.3 `add-agents-config-write`
- **Manager 状態の pinned entry** — 別 change (`add-agents-tab-manager-panel`)、
  agents.yaml migration 後に位置付けが明確化
- **Job filter (role / status)** — Phase 5.2 の filter 実装、今は "Live" と
  "Recent" の 2 section に整理するのみで足りる
- **Change detail の Agent activity 統合** — user 判断で「Change 詳細は task/propose focus」なので実装しない
- **Real-time verdict update event** — Phase 3.5 の out-of-scope 通り、
  次の Job fetch で反映

## Impact

- `web/src/pages/Agents.tsx` — 152 LOC → ~250 LOC (4 section + verdict badge + refresh)
- `web/src/api.ts` — `fetchAgentRuntimes` 追加 (+15 LOC)
- `web/src/store.ts` — `runtimes` state と `loadRuntimes` action (+30 LOC)
- `web/src/types.ts` — `RuntimeStatusResponse` type mirror (+25 LOC)
- `web/src/styles.css` — 4 section の CSS (+80 LOC)
- 新規 tests: 未定 (現状 web/src には JSX unit test の setup 無し、Kanban.test.ts と同じ vitest node 環境で reducer/util 系のみテスト可能)。State 更新 logic の unit test を書ける範囲で追加
- Backward compat: 100% (追加のみ、既存 UI element の削除なし)
