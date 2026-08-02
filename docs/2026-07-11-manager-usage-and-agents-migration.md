---
title: Manager 使用方法と agents.yaml migration
date: 2026-07-11
status: settled
audience: user、agents.yaml を書く人
related:
  - openspec/changes/archive/2026-07-11-add-worker-skills
  - openspec/changes/archive/2026-07-11-add-manager-loop-skill
tags: [manager, phase-4, agents-yaml, usage]
---

# Manager 使用方法と agents.yaml migration

Phase 4.2 で Manager loop (`/opsx:manage <change-id>`) と code worker
(`/opsx:code <change-id>`) が landed した。Phase 4.1 の 4 worker
(`review`, `verify`, `escalate`, `answer`) と組み合わせると、change の
自動 orchestration が完成する。

このドキュメントは:

1. Manager をすぐ試したい人向けの手動起動手順
2. `agents.yaml` を書き換えて Manager を Kanban [Apply] に接続する migration
   recipe
3. 移行 timeline の判断材料

## 1. Manager をすぐ試す (agents.yaml 変更なし)

Phase 4.2 が landed した時点で `agents.yaml` は Phase 1 の legacy shape
のまま (default `claude` agent が `role: apply` + `/ithy-opsx:apply
${change_id}` を叩く)。Kanban [Apply] ボタンは Manager を起動しない。

Manager を手動で試すには:

1. Ithyno dev server が起動していることを確認 (`npm run dev`)
2. 別 terminal で Claude Code を起動 (interactive、`-p` なし)
3. Claude Code の prompt で:

   ```
   /opsx:manage add-foo
   ```

   `add-foo` は試したい change の id。

Manager Claude は Bash tool で `curl` を叩き、`role: code / review /
verify` の dispatch を順に回す。

**このパスの前提**: `agents.yaml` に該当 role の agent が declared
されている必要がある。手動試行用に一時的に追加する例が §2。

## 2. agents.yaml migration recipe

Manager がまともに動くには review-claude / verify-claude / code-claude
の 3 agents が必要。`agents.yaml` を以下の shape に書き換える:

```yaml
worktreePool:
  max: 5

# Phase 3.1 add-runtime-abstraction: runtime 定義を declare
runtimes:
  claude:
    command: claude
    baseArgs: [--dangerously-skip-permissions]
    promptStyle: cli-arg
    promptFlag: -p
    supports:
      interactive: true
      artifactOutput: true
      diff: git

agents:
  # Manager が Kanban [Apply] から起動される。default agent が Manager になる。
  - name: manager-claude
    runtime: claude
    role: manager
    prompt: /opsx:manage ${change_id}
    specialties: [any]
    dedicated: true            # PTY session として常駐

  # Code worker
  - name: code-claude
    runtime: claude
    role: code
    prompt: /opsx:code ${change_id}
    specialties: [any]
    dedicated: false           # pool 利用

  # Review worker
  - name: review-claude
    runtime: claude
    role: review
    prompt: /opsx:review ${change_id}
    specialties: [any]
    dedicated: false

  # Verify worker
  - name: verify-claude
    runtime: claude
    role: verify
    prompt: /opsx:verify ${change_id}
    specialties: [any]
    dedicated: false

  # Legacy 単発 agent は保持 (旧 [Apply] を使いたい場合の fallback)
  - name: claude
    command: claude
    args: [--dangerously-skip-permissions, -p, /ithy-opsx:apply ${change_id}]
    role: apply
    dedicated: false
```

書き換え後の挙動:

- Kanban の [Apply] → `manager-claude` を起動 (`role: manager` の
  default agent が最上位)
- Manager が `/opsx:manage add-foo` を prompt として受け、Bash + curl で
  worker を dispatch
- `role: code` の dispatch は `code-claude` を pool slot で起動
- `role: review` は `review-claude`、`role: verify` は `verify-claude`

**注**: Ithyno の agent selector は最初に role マッチした agent を選ぶ
(Phase 3.2 spec)。[Apply] ボタンは `role: apply` の agent を選ぶ現行実装
なので、上記スキーマだと legacy `claude` agent が優先される。
`agents.yaml` の agent 並び順を意識するか、または Kanban [Apply] の
呼び出しを `role: manager` へ切り替える追加 UI 変更が必要 (別 change:
`add-agents-yaml-migration`)。

## 3. 移行 timeline の判断

現状の選択肢:

### A. `add-agents-yaml-migration` を待つ (推奨)

- `agents.yaml` の shape 変更と Kanban [Apply] の呼び出し先変更を 1 change
  で束ねる
- Phase 5 (観測 UI) より前に landing → Manager が Kanban から使える
- 個別 test は「手動 `/opsx:manage <id>` で動く」まで済んでいる

### B. 早期に `agents.yaml` を書き換える (試行運用)

- 上記 example を手動で `agents.yaml` に書き、dev server を再起動
- Kanban [Apply] の対象 agent が変わる (agent 並び順に依存)
- **リスク**: legacy agent と Manager が混在する期間、user が混乱する
- **利点**: Phase 5 UI 開発の前に Manager を実運用テストできる

### C. 手動 `/opsx:manage` のみで運用

- `agents.yaml` を触らない
- User は毎回 Claude Code の PTY で `/opsx:manage <id>` を打つ
- Kanban [Apply] は legacy `/ithy-opsx:apply` のまま
- **利点**: 何も壊さない。Manager の behavior を確認しやすい
- **欠点**: Ithyno の UI 経由で Manager を起動できない → 実運用にならない

## 4. デバッグの手引き

Manager が動かない典型パターン:

- **Ithyno server が起動していない** → `npm run dev` を確認、port は
  `ITHYNO_PORT` (default 4321)
- **agents.yaml に該当 role の agent がない** → dispatch endpoint が
  404 with `no agent matches role='review'...` を返す
- **runtimes.claude が declared されていない (runtime-backed agent 使用時)** →
  registry が load error、error banner が Kanban 上部に出る
- **Manager loop が convergence cap に到達** → user 対応、
  `/ithy-opsx:answer <id> "..."` で resume

Manager の詳細ログは Ithyno server の stdout。Agents タブでも各 dispatch
の job が個別に追える (Phase 5.1 で Live section が実装されると
timeline が視覚化される)。

## 5. Follow-up items

- `add-agents-yaml-migration` — 実際に `agents.yaml` を書き換える change
- Idea note: `docs/ideas/2026-07-11-manager-max-iterations-config.md` —
  MAX_ITERATIONS を config 化
- Idea note: `docs/ideas/2026-07-11-verify-command-per-project.md` —
  verify の Node 決め打ち解消
