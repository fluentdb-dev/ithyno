---
tags: [feature/revert, area/server, area/web, runtime-collapse, phase-3-rollback]
---

# Revert add-runtime-detection (Phase 3.3)

## Why

R4 of the runtime-collapse pivot. Phase 3.3 (`add-runtime-detection`) added
`GET /api/agents/runtimes` + `which <cmd>` detection scanner + Runtimes 表示
UI。R3 (revert-runtime-abstraction) で `runtimes:` block を撤去した今、
detection 対象がゼロになり endpoint + scanner + UI が dead code 化して
いる。R4 でそれを完全に撤去する。

## Targets

All Case α.

1. **`add-runtime-detection`** (`2026-07-08-add-runtime-detection`, Case α):
   ADDED 2 requirements (Runtime Installation Detection / Runtime Status
   Endpoint) を全 REMOVE。

## What Changes

### Spec (REMOVED — 2 requirements)

- `Runtime Installation Detection`
- `Runtime Status Endpoint`

### Impl

- `server/agents/runtime-detect.ts` — file 削除 (R3 で stub 化してた)
- `server/agents/runtime-detect.test.ts` — file 削除
- `server/index.ts` — `GET /api/agents/runtimes` endpoint と
  `clearRuntimeDetectionCache()` stub 削除、`agents-updated` reload hook から呼出除去
- `web/src/types.ts` — `RuntimeDefPublic` / `RuntimePromptStyle` /
  `RuntimeDiffStrategy` / `RuntimeSupports` / `RuntimeStatusResponse` 型削除
- `web/src/api.ts` — `fetchRuntimes()` 等の client 関数削除
- `web/src/store.ts` — runtimes state / loadRuntimes() 削除
- `web/src/pages/Agents.tsx` — Runtimes section 表示があれば撤去
- `web/src/styles.css` — `.runtimes-section` / `.runtime-*` クラス削除

## Case α revert validity

target archived。R3 で書き手 (runtimes: block) が消えたため
detection の入力が常に empty。endpoint / scanner / UI 全体が死んでいるので
撤去して問題無し。

## Blast radius

- **Server**: 1 endpoint 撤去 + 2 test file 削除
- **UI**: Runtimes セクション消失 (もし表示していれば)
- **types**: `RuntimeDefPublic` 一族が消える

## Out of scope

- WorktreePool — R5
- Agent PTY runner — R6
