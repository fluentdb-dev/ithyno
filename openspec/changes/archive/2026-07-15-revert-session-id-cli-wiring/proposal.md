---
tags: [feature/revert, area/server, runtime-collapse, phase-5-rollback]
---

# Revert add-session-id-template-var

## Why

R7 of the runtime-collapse pivot. `add-session-id-template-var` は
`${session_id}` テンプレート変数 + change 単位で UUID を mint する
session store (`.ithyno/sessions.json`) を追加した。R1 で dispatch
endpoint が消えて runner の入り口が `/api/agents/run` (session-id 未対応)
だけになった今、session-id の CLI wiring は unused。撤去。

## Targets

All Case α.

1. **`add-session-id-template-var`** (`2026-07-14-add-session-id-template-var`, Case α):
   ADDED 3 requirements 全 REMOVE (Template Variable Session Id /
   Change-Scoped Session Id Persistence / Dispatch Session Correlation)

## What Changes

### Spec (REMOVED — 3 requirements)

- `Template Variable Session Id`
- `Change-Scoped Session Id Persistence`
- `Dispatch Session Correlation`

### Impl

- `server/agents/session-store.ts` + `session-store.test.ts` file 削除
- `server/agents/registry.ts` — `resolve()` の `session_id` 引数 +
  `${session_id}` template substitution 撤去
- `server/agents/registry-session-var.test.ts` file 削除
- `server/agents/runner.ts` — `sessionId` param on `run()` + `Job.sessionId`
  field 撤去
- `web/src/types.ts` — `JobSummary.sessionId` 撤去
- `agents.yaml` — claude agent の `--session-id ${session_id}` args を削除

**Migration**: 既存 `.ithyno/sessions.json` は無害な残骸として残す
(手動削除 or 別 cleanup change で)。agents.yaml で `${session_id}` を
使っている entry (現在: claude agent の args) は該当 args を削除する。

## Case α revert validity

target archived、3 requirements landed。REMOVED delta で spec + session
store 実装 + template var 撤去。

## Blast radius

- **Server**: session-store 一族削除 + registry/runner の session_id 経路
  撤去 (~50 LOC)
- **Test**: session-store.test.ts (~10) + registry-session-var.test.ts (~6)
  削除
- **agents.yaml**: 現行 claude agent の `--session-id ${session_id}` args を
  外す (Claude Code に session 生成させる、resume 不可になる)

## Out of scope

- Schema slim (concurrency/specialties) — R8
- Manager 特別扱い — R9
