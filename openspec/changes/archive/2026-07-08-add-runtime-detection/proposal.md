---
tags: [phase-3, agents, runtime, api, area/server]
phase: 3
milestone: Manager 用の底面
sequence: 3
depends_on:
  - add-runtime-abstraction
enables:
  - extend-agent-job-model
  - add-agents-tab-live-panel
---

## Why

Phase 3.1 で `agents.yaml` の `runtimes:` section が受け入れられるように
なったが、**declared だが実際に install されていない runtime** が混じって
いても Ithyno は気付かない。Manager が `/opsx:dispatch code add-foo
--runtime=copilot` を叩いた時に初めて `gh copilot suggest` が not-found
で失敗する。UX として遅い。

Phase 5.1 の Agents タブ (live panel + Runtimes section) では
「installed / not found」を先に見せて user に整合を取ってもらう。その
下地として、**server 起動時 (と runtime 参照時) に `which <cmd>` を走らせ、
install 状況を registry に付随させる**。

Phase 3.1 の outcome.md でも「3.3 の endpoint は薄い、`runtimes()`
accessor は既に用意」と note 済。今回はその薄い endpoint を実装する。

## What Changes

### 1. Runtime installed detection

`which <cmd>` (POSIX) / `where <cmd>` (Windows は out-of-scope) を子プロセスで
実行して exit code を見る。同じ command が複数 runtime で使われている
ケースを想定して、cache する:

```typescript
// server/agents/runtime-detect.ts (new)
async function detectRuntime(command: string): Promise<{ installed: boolean; path?: string; error?: string }>;
async function detectAllRuntimes(runtimes: Record<string, RuntimeDef>): Promise<Record<string, DetectionResult>>;
```

Detection は起動時に 1 回 + 明示 `?refresh=1` で再走査。運用中に PATH や
brew install で状況が変わっても、endpoint 呼び直しで更新できる。

### 2. `GET /api/agents/runtimes` endpoint

Runtime 定義 + install 状況を返す:

```typescript
type RuntimeStatusResponse = {
  runtimes: Array<{
    name: string;
    command: string;
    baseArgs: string[];
    promptStyle: "cli-arg" | "stdin" | "file";
    promptFlag?: string;
    supports: RuntimeSupports;
    installed: boolean;
    path?: string;         // 発見された絶対 path (installed 時)
    error?: string;        // 見つからない時の message
  }>;
};
```

- Local-only (`isLocal` guard)
- Query param `?refresh=1` で detection 再実行

### 3. 使用側 (今回 change の scope 外)

Phase 5.1 `add-agents-tab-live-panel` が Agents タブの Runtimes section で
`installed` バッジ描画に使う。Phase 3.3 では endpoint を提供するだけで
UI 側は触らない。

### 4. Selector 統合 (今回 scope 外)

Fable review MEDIUM の「installed でない runtime を選ばない」guard は
Phase 3.3 に含めない — dispatch する側 (Phase 4 Manager) が
`/api/agents/runtimes` を事前に見て判断する経路のみで整合を取る。
Selector 内で installed guard を強制すると config UI が「configured but
not installed」を触れない副作用があり、user の設定意図を尊重する方向に。

## Out of scope

- Windows `where <cmd>` サポート
- Version detection (`<cmd> --version` を叩いて minimum version 判定)
- Selector 内の installed guard (dispatch する側の責務)
- UI 側の render (Phase 5.1)
- `detectRuntime` の PATH cache 無効化 (LRU 等) — 起動時 + explicit refresh で十分

## Impact

- 新規 `server/agents/runtime-detect.ts` (~60 LOC)
- `server/index.ts` — 新規 route `GET /api/agents/runtimes` (~30 LOC)
- 新規 `server/agents/runtime-detect.test.ts` (~10 tests)
- 変更なし: registry.ts / runner.ts / dispatch.ts / UI
- Backward compat: 100% (新規追加のみ)
