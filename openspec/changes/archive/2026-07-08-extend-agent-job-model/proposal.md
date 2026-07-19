---
tags: [phase-3, agents, jobs, model, area/server, area/web]
phase: 3
milestone: Manager 用の底面
sequence: 4
depends_on:
  - add-runtime-abstraction
  - add-dispatch-endpoint
enables:
  - add-review-artifact
  - add-agents-tab-live-panel
---

> **REVERTED** by [revert-agent-job-model](../../changes/revert-agent-job-model/) — R1 (revert-dispatch-endpoint) 後に role/runtime/artifactPaths field の意味が消失。2 requirements (Job Model Includes Role And Runtime / Job Model Includes Artifact Paths On Finish) を全 REMOVE。

## Why

Phase 3.2 の `add-dispatch-endpoint` は response で `agentName / runtime /
artifactPaths` を返すが、これらは **Job 型自体には保存されていない**。
Dispatch endpoint が `runtimeLabel(agent)` を計算し、`listChangeArtifacts`
で git status を叩いて即席に組み立てているだけ。

結果として:

- Agents タブ (Phase 5.1 で live panel を書く時) は `/api/agents/jobs`
  を叩くが、role / runtime / artifact 情報が Job に無いため取れない
- 同じ artifact discovery ロジックが dispatch と runner に散らばる兆し
- 既存 job (旧仕様) との整合が取れず、Phase 5.1 の UI が job source
  ごとに分岐する羽目になる

**Job 型を拡張し、`role` / `runtime` / `artifactPaths` を Job の
first-class フィールドにする**。Runner が spawn 時に role/runtime を、
finish 時に artifactPaths を populate する。Dispatch endpoint は Job から
そのまま読むように refactor する。

**Verdict は Phase 3.5 で入る** — `review.md` の schema が Phase 3.5
`add-review-artifact` で定義されるため、Phase 3.4 では触らない。予約 field
を型に置くのも保留 (schema が固まってから追加する方が安全)。

## What Changes

### 1. `JobSummary` に 3 field 追加 (server + web sync)

```typescript
export type JobSummary = {
  id: string;
  changeId: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number | null;
  worktreeProgress?: Progress;
  // New:
  role: string;                    // required — agent の role (spawn 時に固定)
  runtime: string;                 // required — "legacy" or runtime 名
  artifactPaths?: string[];        // finish 時に populate、running 中は undefined
};
```

Web 側 (`web/src/types.ts`) にも同じ 3 field を反映。既存 UI (`Agents.tsx`)
は今回まだ使わない — Phase 5.1 で consuming する。

### 2. Runner — spawn 時に role/runtime を設定

現状 3 か所で `const job: Job = { ... }` が起きる:

- `run()` — 正常 spawn
- `adoptExistingOrphan()` × 2 — pool / dedicated worktree の adoption

正常 spawn (a) は `def.role` と `runtimeLabel(def)` から取る。Adoption
(b) は agent def が無いので:

- `role: "orphan"` (固定)
- `runtime: "unknown"` (固定)

`runtimeLabel` は既に `dispatch.ts` で export されているが、runner から
import できる位置に置き直す必要がある — 選択肢:

- **A**: `dispatch.ts` の `runtimeLabel` を `registry.ts` に移す (registry は
  agent 型を知っているので natural)
- **B**: `runtimeLabel` は `dispatch.ts` に残し、runner が dispatch から
  import (dispatch → runner のロジック依存が生まれるので不自然)

**A を採用**。`registry.ts` 内に export function 追加、`dispatch.ts` は
re-export or 直 import に。

### 3. Runner — finish 時に artifactPaths を populate

現状 `finish()` は `agent-job-finished` event を emit して終わり。ここで
`listChangeArtifacts(worktreePath, changeId)` を呼び、job.artifactPaths に
セットする。

`listChangeArtifacts` は現在 `dispatch.ts` に置いてあるが、artifact
detection は Runner の責務 — こちらも `runner.ts` (or 新規
`server/agents/artifact-scan.ts`) に移す。Dispatch は `job.artifactPaths`
を読むだけ。

移動先: **`server/agents/artifact-scan.ts`** (新規、単機能モジュール) —
runner と dispatch の両方から使いやすい位置。

### 4. Dispatch — Job から読むように refactor

`dispatch.ts` の `dispatch()` 関数内で `listChangeArtifacts` を呼んでいる
箇所を削除、代わりに完了後の `runner.getJob(id)?.artifactPaths ?? []`
を読む。

### 5. AgentDef.role の default

現状 `role: "coder"` が default で `apply / code / review / verify` の
system role を使う場合は明示指定する形。今回変更なし — Phase 4 の
agents.yaml migration で見直す。

### 6. Orphan adoption と "role"

adopt-orphans が作る Job は agent def を知らない (worktree の branch 名
から change id を復元するだけ)。妥当な role は?

- **`"orphan"`** を採用 (system role として予約)
- Agents タブでは "Orphaned" バッジで既に区別されている
- 将来 orphan の元 agent name が判明する経路が入ったら書き直す

### 7. WS event の updated payload

`agent-job-started` は `job: JobSummary` を broadcast する。role/runtime が
JobSummary の必須 field になったので、既存 client (web) はスキーマ変更を
受け取る。web/src/types.ts を先に更新すれば型的に自動追随。

`agent-job-finished` は `{ jobId, status, exitCode }` のまま。artifactPaths
は次の `/api/agents/jobs/:id` fetch で見える (現状 finish 時に client 側の
再フェッチをトリガーする仕組みは無いが、次の spawn or reload 時に反映)。

Phase 5.1 で live panel が入る時に必要なら別途 `agent-job-artifacts-updated`
のようなイベントを検討。

## Out of scope

- **`verdict` field** — Phase 3.5 `add-review-artifact` で `review.md`
  schema を確定してから型に追加
- **agents.yaml の role migration** — Phase 4 で default agent を
  `role: apply` に書き換える判断は別 change
- **Orphan の origin agent 復元** — worktree branch から前回の agent name
  を復元する経路は今回スコープ外
- **UI 更新** — Agents.tsx が role/runtime を表示するのは Phase 5.1
- **artifact-scan の filesystem watcher 化** — 現状は job finish 時の
  one-shot scan のみ。running 中の live artifact 更新は不要

## Impact

- `server/agents/runner.ts` — Job 作成 3 か所に role/runtime 追加、finish に
  artifactPaths populate ロジック (~30 LOC 追加)
- 新規 `server/agents/artifact-scan.ts` — `listChangeArtifacts` を切り出し
  (~30 LOC)
- `server/agents/dispatch.ts` — `listChangeArtifacts` 呼び出しを削除、
  Job から読む形に (~20 LOC 削減)
- `server/agents/registry.ts` — `runtimeLabel` を export function 化
- `server/agents/runner.ts` — `runtimeLabel(def)` を import
- `web/src/types.ts` — JobSummary に 3 field 追加
- 既存 tests のうち Job 生成を assert しているものが型変更で fail する
  可能性 → 該当箇所は role/runtime を含む形に更新
- 新規 test: `runner` の role/runtime/artifactPaths population、
  `artifact-scan` の unit test
- Backward compat: `/api/agents/jobs` response の shape 拡張のみ
  (削除・変更なし)。Web 側 UI は無変化
