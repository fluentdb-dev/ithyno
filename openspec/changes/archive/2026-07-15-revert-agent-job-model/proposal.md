---
tags: [feature/revert, area/server, area/web, runtime-collapse, phase-3-rollback]
---

# Revert extend-agent-job-model (Phase 3.4)

## Why

R2 of the runtime-collapse pivot (`docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md`).
`extend-agent-job-model` は Phase 3.4 で JobSummary に `role` + `runtime` +
`artifactPaths` を追加し、dispatch endpoint と review artifact 連携の土台を
作った。**R1 (revert-dispatch-endpoint) で dispatch endpoint が消えた今、
`role` / `runtime` / `artifactPaths` field も意味を失う** (Claude 側の
Task tool 呼び出しは job model を持たない)。

## Targets

All Case α.

1. **`extend-agent-job-model`** (`2026-07-08-extend-agent-job-model`, Case α):
   ADDED 2 requirements (Job Model Includes Role And Runtime / Job Model
   Includes Artifact Paths On Finish) を全部 REMOVE。

## What Changes

### Spec (REMOVED — 2 requirements)

- `Job Model Includes Role And Runtime`
- `Job Model Includes Artifact Paths On Finish`

### Impl

- `server/agents/runner.ts` — `JobSummary.role` / `runtime` / `artifactPaths`
  field 撤去、`run(...)` の `dispatchedRole` パラメータ撤去、`listChangeArtifacts()`
  呼び出しとインポート撤去
- `server/agents/artifact-scan.ts` — 全体削除 (dispatch endpoint と共に消えたので用途無し)
- `web/src/pages/Agents.tsx` — `job-role-badge` / `job-runtime-badge` span 撤去
- `web/src/types.ts` — `JobSummary.role` / `runtime` / `artifactPaths` 型撤去
- Test: 関連 test 削除

## Case α revert validity

target `extend-agent-job-model` は archived、追加した 2 requirements は
現在 `openspec/specs/dashboard/spec.md` に landed 済み。REMOVED delta で
spec から抹消され、対応する type field / UI badge / server 側の
`listChangeArtifacts` 参照が撤去される。

**残る `job.verdict`** は `add-review-artifact` (Phase 3.5) 由来なので R? で
別途 revert する。**残る `job.sessionId`** は `add-session-id-template-var`
由来で R7 で別途 revert。両者は今回触らない。

## Blast radius

- **Server**: `JobSummary` 型が細くなる (`role` / `runtime` / `artifactPaths`
  消失)、`runner.ts` の spawn ロジックが `dispatchedRole` 不要になる
- **UI**: Recent Jobs badge から role / runtime 表示が消える (verdict badge
  は残る)
- **Tests**: `extend-agent-job-model` 由来の integration test あれば削除
- **Migration**: 既存 job runs に role / runtime を持つものが記録されて
  いても memory-only なので影響なし (再起動でクリア)

## Out of scope

- `job.verdict` (review artifact) の撤去 — 別 revert change
- `job.sessionId` (session_id CLI wiring) の撤去 — R7
- `WorktreePool` — R5
- PTY runner 一式 — R6
