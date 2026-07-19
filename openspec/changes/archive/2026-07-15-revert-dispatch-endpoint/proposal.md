---
tags: [feature/revert, area/server, runtime-collapse, phase-3-rollback]
---

# Revert dispatch-endpoint (Phase 3.2)

## Why

`docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md` で整理した通り、
Phase 3-5 で積んだ runtime layer (dispatch endpoint / job model / runner /
PTY / WorktreePool / runtime detection) は、single-user + Claude 経由の実利用
パターンでは Claude 側能力 (Task tool + skills + bash) の再実装になっている。

本 change はその段階撤退の第一手 (R1)。**`POST /api/agents/dispatch` を撤廃**
し、dispatch 判断を skill (`/opsx:code`, `/opsx:review`, `/opsx:verify`,
`/opsx:manage`) に戻す。role → agent 選択は Claude 側 (skills + agents.yaml
declaration) が判断する形になる。

## Targets

All Case α.

1. **`add-dispatch-endpoint`** (`2026-07-07-add-dispatch-endpoint`, Case α):
   ADDED 3 requirements (Role-Based Agent Dispatch API / Agent Selection By
   Role And Specialties / Synchronous Dispatch With Timeout) を全部 REMOVE。

## What Changes

### Spec (REMOVED — 3 requirements)

- `Role-Based Agent Dispatch API`
- `Agent Selection By Role And Specialties`
- `Synchronous Dispatch With Timeout`

### Impl

- `server/agents/dispatch.ts` — `selectAgent()` + `POST /api/agents/dispatch`
  handler の削除
- `server/index.ts` — dispatch route の unregister
- `server/agents/dispatch.test.ts` — テスト削除
- `.claude/commands/opsx/dispatch.md` — slash command 削除
- `.claude/skills/opsx-dispatch/` — skill directory 削除 (存在すれば)

## Case α revert validity

target `add-dispatch-endpoint` は archived。追加した 3 requirements は現在
`openspec/specs/dashboard/spec.md` に landed 済み。REMOVED delta で spec
から抹消され、対応する route / handler / test / skill が撤去される。

`add-dispatch-endpoint` を depend していた後続 change (`add-runtime-detection`,
`extend-agent-job-model`, `add-review-artifact`, `add-manager-loop-skill`) は
後続の R2-R9 で順次 revert する予定。本 revert が先に走ることで、それら後続
の revert change が dispatch endpoint 依存を気にせず書ける。

Manager loop (`/opsx:manage`) は現状 dispatch endpoint を呼んでいるが、これは
skill 側で「Claude に code してくれと頼む」形に書き直す (別 change で扱う)。
本 revert では skill 書き直しは対象外、endpoint 撤去のみ。

## Blast radius

- **Server**: `POST /api/agents/dispatch` 撤去。同 endpoint を呼ぶ既存 client
  は Manager skill のみで、後続 revert で skill 側を patch する
- **UI**: Kanban / Agents tab には直接影響なし (dispatch は skill 経由)
- **Tests**: `server/agents/dispatch.test.ts` (5 test suites, ~30 cases) 削除
- **Test 総数**: 311 → ~280 (30 減)

## Out of scope

- Skill 側 (`/opsx:manage`, `/opsx:code` 等) の書き直し — 別 change
- `selectAgent` ロジックの UI 側移設 — `useStartFlow.tsx` の code-role
  filter は既に landed (b2b50f9 前後)、それで足りる
- Job model / worker subprocess の撤退 — R2 (`revert-agent-job-model`) 以降
