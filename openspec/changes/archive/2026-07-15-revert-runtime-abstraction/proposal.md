---
tags: [feature/revert, area/server, area/web, runtime-collapse, phase-3-rollback]
---

# Revert add-runtime-abstraction (Phase 3.1)

## Why

R3 of the runtime-collapse pivot (`docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md`).
`add-runtime-abstraction` (Phase 3.1) は「1 個の agent 定義が Claude 決め打ち
になるのを避け、runtimes: block で CLI + prompt style + capabilities を
中央定義し、agent は runtime: 参照で inherit する」という抽象化を導入した。

**R1 (dispatch endpoint) + R2 (job model) で dispatcher / runtime label /
artifact scanner がすべて消えた今、runtime abstraction 自体の意味が
薄い**。現行 `agents.yaml` は既に legacy shape (直接 `command + args`) で
書かれており runtime block を使っていない。schema / parser / UI から
不使用の抽象化を撤去して agent 定義を「name + command + args + mode +
roles + prompts」の単一形に絞る。

## Targets

All Case α.

1. **`add-runtime-abstraction`** (`2026-07-07-add-runtime-abstraction`, Case α, PARTIALLY REVERTED):
   ADDED 3 requirements のうち 2 を REMOVE (Runtime Definitions In agents.yaml
   / Runtime-Backed Agents)。3 番目の `Backward Compatibility With
   Command-Based Agents` は `reshape-agents-yaml-mode-roles` によって
   後日 MODIFIED され、現在は「legacy yaml → mode+roles+prompts 正規化」
   の spec に repurpose 済み。ここは reshape の資産として残す。

## What Changes

### Spec (REMOVED — 2 requirements)

- `Runtime Definitions In agents.yaml`
- `Runtime-Backed Agents`

### Impl

- `server/agents/registry.ts` — `RuntimeDef` 型 / `runtimes:` parse /
  runtime inheritance in `resolve()` / `runtimeLabel()` 関数 削除
- `server/agents/registry-reshape.test.ts` — runtime inheritance 系 test 削除
- `web/src/types.ts` — `RuntimeDefPublic` 型、`AgentPublic.runtime?` field、
  `AgentConfigPublic.runtimes` field 削除
- `web/src/components/AgentConfigModal.tsx` — Runtime dropdown / inherited
  preview / `pick a runtime OR set a command` validation / prompt source
  badge の runtime 分岐 撤去
- `web/src/store.ts` — 該当 field 参照があれば patch
- Test / example yaml — `runtimes:` block を使う fixture があれば書き換え

## Case α revert validity

target `add-runtime-abstraction` は archived、追加した 3 requirements は
現在 `openspec/specs/dashboard/spec.md` に landed。REMOVED delta で spec
から抹消され、parser / UI / type から runtime 抽象化が撤去される。

現行 `agents.yaml` (project root) は既に non-runtime shape なので **既存
file には手を入れる必要無し**。R1/R2 が dispatcher / job model を撤去した
のと同じく、上位から順に薄くする段階。

## Blast radius

- **Server**: registry の parse ロジックが薄くなる、`resolve()` の
  runtime inheritance 分岐消失、`runtimeLabel()` 削除 (R2 で unused 化)
- **UI**: Modal の Advanced disclosure から Runtime dropdown が消える
  (default で collapsed のため普段使いには不可視)
- **Migration**: 既存 project の `agents.yaml` に `runtimes:` block が
  あれば起動時に parse error になる。README / doc に注意書きを追加

## Out of scope

- Runtime detection (`add-runtime-detection` Phase 3.3) の撤去 — R4
- Session-id CLI wiring — R7
- Manager special-casing — R9
