---
tags: [feature/revert, area/server, runtime-collapse, phase-1-rollback]
---

# Revert add-worktree-pool

## Why

R5 of the runtime-collapse pivot. `add-worktree-pool` は「複数 change を
並列で回せるように WorktreePool から worktree slot を lease する」機構を
Phase 1 で追加した。しかし runtime-collapse 方針 (Claude/agmsg 側が worktree
を自前で扱う) の下では pool の意味が薄い。**agent は常に dedicated
`.worktrees/<change-id>/` に spawn する** 原始形に戻す。

## Targets

All Case α.

1. **`add-worktree-pool`** (`2026-07-05-add-worktree-pool`, Case α):
   ADDED 4 requirements (Opt-In Configuration / Acquisition / Release And
   Cleanup / Restart Recovery) を全 REMOVE。

## What Changes

### Spec (REMOVED — 4 requirements)

- `Worktree Pool Opt-In Configuration`
- `Pool Worktree Acquisition`
- `Pool Worktree Release And Cleanup`
- `Pool Worktree Restart Recovery`

### Impl

- `server/agents/pool.ts` + `pool.integration.test.ts` — file 削除
- `server/agents/registry.ts` — `WorktreePoolConfig` / `DEFAULT_WORKTREE_POOL`
  / `validateWorktreePool` / top-level `worktreePool:` parse / `worktreePoolConfig()`
  method / `AgentDef.dedicated` 削除 (dedicated flag は R8 予定だが pool と
  一緒に消す)
- `server/agents/runner.ts` — `WorktreePool` import / `pool` field /
  `pool.acquire` / `pool.release` / `fromPool` field / `dedicated === false`
  branch 撤去。orphan-adoption の pool 認識分岐も削除
- `web/src/types.ts` — `AgentPublic.dedicated` 削除

**Migration**: 既存 `agents.yaml` に `worktreePool:` block + agent の
`dedicated: false` があれば起動時に unknown key として reject or 単に
無視。今の `agents.yaml` の `dedicated: false` は claude agent に付いて
いるので、これを true に変更 (or field 削除) する。

## Case α revert validity

target archived。4 requirements は `openspec/specs/agent-runner/spec.md` に
landed。REMOVED delta で spec + pool 実装が撤去され、agent は Phase 1
初期の「dedicated worktree only」挙動に戻る。

## Blast radius

- **Server**: pool 一族 250 LOC 削除 + runner.ts の pool 分岐 (~30 LOC) 削除
- **Test**: pool.integration.test.ts (7 tests) 削除
- **agents.yaml**: `worktreePool:` block と `dedicated: false` フィールドの
  意味が消える。次の起動で warning or 無視される
- **UI**: 特になし (dedicated field は Modal Advanced にあるが R8 target)

## Out of scope

- `AgentDef.dedicated` の schema slim 化 (`concurrency` / `specialties` と
  同時撤去) — R8
- Manager section 特別扱い — R9
- PTY runner 撤去 — R6
