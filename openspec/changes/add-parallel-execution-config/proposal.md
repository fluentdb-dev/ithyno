---
tags: [feature/config, area/server, area/web, runtime-collapse-followup]
---

# Add `parallelExecution` config + Settings tab, remove ExecutionPicker

## Why

現状 Kanban Start 押すたびに **ExecutionPicker** が「Terminal (Claude 共有
session)」と「Worktree (isolated · parallel-safe)」の 2 択を毎回聞いてくる。
実質は「並列実行を有効にするか」の 1 択で、change ごとに変わるものでも
ないので config 化してピッカー撤去。

`docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md` の A2
follow-up そのもの。runtime-collapse pivot (R1-R9) 完了後の cleanup。

## What Changes

### Config

- `agents.yaml` top-level に **`parallelExecution: boolean`** 追加
  (optional, default `false`)。既存 field と mutual に触らない
- `false` = terminal branch (Claude REPL に `/opsx:apply <id>` inject)
- `true` = worktree branch (`.worktrees/<id>/` に agent spawn)

### Start flow

- **`ExecutionPicker` component 撤去**
- `useStartFlow.tsx` は以下の優先順位で分岐:
  1. `change.proposal.execution` が設定されていれば従う (change-level override)
  2. `parallelExecution` config を参照 (`true` → worktree、`false` → terminal)
  3. 事前条件不足 (agents.yaml empty / not a repo / no commits) は toast + 早期 return

### Settings tab

- 新規 route `/settings` + `<Settings>` page
- Trigger: 新規 NavLink 「Settings」
- 表示: `Parallel execution: [ ]` checkbox のみ (将来 theme / port 等の受け皿にも)
- 保存: `POST /api/config/parallel-execution` `{value: boolean}` → agents.yaml
  top-level を surgical edit

### 削除

- `web/src/components/ExecutionPicker.tsx` (file)
- `useStartFlow.tsx` の picker state / setter / component render
- CSS `.execution-picker` / `.execution-options` / `.execution-option*` /
  `.execution-save` / `.execution-disabled-reason`
- `proposal.execution` の frontmatter は残す (change-level override として)

## Impact

- **Affected specs**: `dashboard` (ADDED: parallelExecution config +
  Settings tab)
- **Affected code**: `server/agents/registry.ts` (parse config field +
  publicConfig), `server/agents/config-writer.ts` (or new endpoint) で
  config write path、`web/src/App.tsx` (Nav + Route)、`web/src/pages/Settings.tsx`
  (new)、`web/src/hooks/useStartFlow.tsx` (picker → config-based branch)、
  `web/src/components/ExecutionPicker.tsx` (削除)、`styles.css` (削除)
- **Risk**: 現状 ExecutionPicker で「Terminal を save」した proposal は
  `proposal.execution: terminal` を持つ。今回の変更後もこれが優先されるので
  behavior は不変
- **Migration**: 既存 `agents.yaml` に `parallelExecution` が無ければ
  `false` として扱う (default)。何もしなくて良い
