---
tags: [phase-3, agents, dispatch, api, skills]
phase: 3
milestone: Manager 用の底面
sequence: 2
depends_on:
  - add-runtime-abstraction
enables:
  - add-runtime-detection
  - extend-agent-job-model
  - add-review-artifact
  - add-manager-prompt-and-skills
---

## Why

`add-runtime-abstraction` (Phase 3.1) で agents.yaml が `role` と `runtime` を持てるようになったが、Ithyno には **role をキーに agent を選ぶ dispatch 経路**がない。Phase 4 の Manager (`/opsx:apply` claude session) は work loop の中で:

- 「code role の agent を回して結果を見る」
- 「review role の agent を回して verdict を判断」
- 「verify role の agent を回して done か判断」

をやる必要がある。既存の `POST /api/agents/run` は `agentName` を明示指定する fire-and-forget で、role selector も sync 応答も持たない。Manager が使える dispatch API を新設する。

Fable review (2026-07-07) の HIGH #1 指摘に沿って: Manager は Claude Code の **Bash tool から curl でこの endpoint を叩く**。slash command はその指示を保持する prompt template。RPC magic ではない。

## What Changes

### 1. `POST /api/agents/dispatch` route

```typescript
type DispatchBody = {
  role: string;              // "code" | "review" | "verify" | ...
  changeId: string;
  runtime?: string;          // 明示指定 (agents.yaml で複数候補あれば絞る)
  promptSuffix?: string;     // Manager が prompt に追加したい指示
  wait?: boolean;            // default true (sync)、false で job id だけ即 return
  timeoutMs?: number;        // default 30 min、sync ケース用
};

type DispatchResponse = {
  jobId: string;
  agentName: string;
  runtime: string;           // 選ばれた runtime name (legacy agent は "legacy")
  status: "completed" | "failed" | "cancelled" | "timeout";
  exitCode?: number;
  stdoutTail?: string;       // 最後 4KB
  artifactPaths?: string[];  // 該当 change dir に生成された artifact ファイル
  // verdict の structured 表現は Phase 3.5 (add-review-artifact) で追加
};
```

- Local-only (`isLocal` guard、既存 `/api/agents/run` と同じ)
- Wait=true (default) は job 完了まで block、response で結果 return
- Wait=false は job id を即 return、Manager 側で `/api/agents/jobs/:id` polling
- Timeout 到達で status="timeout" + プロセス cancel

### 2. Agent selector — role + specialties + runtime

`agents.yaml` から dispatch 用 agent を選ぶ:

1. **role match**: `agent.role === body.role` にマッチする集合
2. **specialties match**: change の proposal.tags と agent.specialties の intersect
   - Agent の specialties が `["any"]` or 空 → 常にマッチ
   - Change のタグに一致するものが 1 つでもあれば OK
3. **runtime filter**: body.runtime 指定時は agent の runtime (or legacy 判定) が一致するもののみ
4. **順序決定**: 上記条件を満たす候補群から `agents.yaml` の並び順で先頭を選ぶ (deterministic)
5. **不在**: 404 with hint "no agent matches role=<role> for change <id>"

### 3. `/opsx:dispatch` slash command

`.claude/commands/opsx/dispatch.md` を新規作成。Manager が `/opsx:dispatch code add-foo` を叩いた時、Claude Code は expanded prompt を読み、**Bash tool で curl** を実行する形。

```markdown
---
description: Dispatch a role-based worker agent on a change
argument-hint: <role> <change-id> [--runtime=<name>] [--prompt-suffix="<text>"]
---

Parse the arguments: $ARGUMENTS
Extract role, changeId, and optional --runtime / --prompt-suffix flags.

Then run the following bash command to dispatch the worker
(local-only endpoint, blocks until the worker completes):

curl -sS -X POST http://localhost:4321/api/agents/dispatch \
  -H 'content-type: application/json' \
  -d '{"role":"<role>","changeId":"<changeId>","runtime":"<runtime or null>","promptSuffix":"<suffix or null>","wait":true}'

Parse the JSON response and report to the caller:
- agent name, runtime, status, exit code
- if `artifactPaths` is present, list them and (for review roles) read the review artifact to extract the verdict
- if `status === "failed"`, surface the reason

The caller (typically the Manager loop) uses this to advance the phase.
```

**HIGH #1 Fable review**: この slash command は magic RPC ではなく、単に Manager Claude が Bash + curl を実行するための prompt。実 dispatch semantics は HTTP API 側にある。

### 4. Wait semantics 実装

Wait=true 時:
- `agentRunner.run(changeId, agentName)` で job を start (既存)
- Job の完了 (`completed | crashed | cancelled`) or timeout まで event を待つ
- 内部で `agentRunner.on("agent-job-completed", ...)` を subscribe、対象 job id 一致で resolve
- 完了後: change dir 内の変更ファイル一覧を取得 (`git status` の untracked/modified) — これが暫定 `artifactPaths`
- Stdout tail (末尾 4KB) を job.output から抜き出し

### 5. Backward compat

- `POST /api/agents/run` は変更なし (agentName ベース、fire-and-forget)。既存 [Start] ボタンからの経路はそのまま
- Kanban / Agents タブ UI は変更なし
- 既存 `agents.yaml` (legacy `command + args` の claude agent) は role="apply" (デフォ role="coder" だが agents.yaml で `role: apply` 指定するか、default role で code/review/verify とマッチしないかは実装時判断) で dispatch 可能に

**判断**: default agent の role を Phase 3.2 のスコープで変更するか否か。**変更しない** — Phase 4 の Manager skill 導入時に agents.yaml migration とセットで判断。Phase 3.2 は dispatch mechanism を用意するのみ。

### 6. Artifact discovery (basic)

Phase 3.5 で `review.md` schema を formalize するまで、artifact discovery は素朴に:
- Job 完了後 `git status --porcelain` を change worktree で走らせる
- Untracked (`??`) と modified (`M`) ファイルのうち、`openspec/changes/<changeId>/` 配下のパスを集める
- そのリストを `artifactPaths` として return

Verdict の structured parse は **やらない**。Phase 3.5 に譲る。

## Out of scope

- **Verdict の structured 表現** — Phase 3.5 `add-review-artifact` で `review.md` schema + parser を landed 時に応答に `verdict` フィールド追加
- **Async polling の完備** — wait=false 時の job status polling は既存 `/api/agents/jobs/:id` を使う想定。Phase 3.2 では専用 endpoint を作らない
- **Manager 実装** — dispatch を呼ぶ側の `/opsx:apply` skill の Manager loop は Phase 4.1 `add-manager-prompt-and-skills`
- **並列 dispatch の queue** — 同 change に対する複数 dispatch は既存の `locks.set(changeId, jobId)` で serialize される (完了待ちで sequential)。並列は同 pool から別 change の dispatch のみ許容
- **HIGH #3 (Fable) の runtime-aware `-p` 注入 fix** — 実際に非 Claude runtime を動かした時に fix。Phase 3.2 の scope 外

## Impact

- 新規 `server/agents/dispatch.ts` — selector logic (~80 LOC)
- `server/index.ts` — 新規 route `POST /api/agents/dispatch` (~50 LOC)
- 新規 `.claude/commands/opsx/dispatch.md` — slash command prompt template
- Test: 新規 `server/agents/dispatch.test.ts` (~15 tests、selector + wait semantics 中心)
- Test: `server/agents/registry.ts` は変更なし
- Backward compat: 既存 API / UI / agents.yaml 全て不変
