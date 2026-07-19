---
tags: [phase-3, agents, runtime, agents-yaml, area/server]
phase: 3
milestone: Manager 用の底面
sequence: 1
depends_on: []
enables:
  - add-dispatch-endpoint
  - add-runtime-detection
  - extend-agent-job-model
  - add-review-artifact
---

> **PARTIALLY REVERTED** by [revert-runtime-abstraction](../../changes/revert-runtime-abstraction/) — R1/R2 で dispatcher/job-model 撤退後に runtime 中央定義の意味が消失。`Runtime Definitions In agents.yaml` と `Runtime-Backed Agents` の 2 requirement を REMOVE。`Backward Compatibility With Command-Based Agents` は後日 `reshape-agents-yaml-mode-roles` によって MODIFIED (legacy shape 正規化 spec に repurpose) されており、そちらは残す。

## Why

Phase 3 で Manager (Phase 4) が `/opsx:dispatch code add-foo` のような
形で worker を dispatch する時、Ithyno は role に対応する worker agent を
spawn する。この worker は Claude だけでなく **aider / copilot / gemini
CLI 等の非 Claude runtime** も候補になり得る (`docs/2026-07-06-phase-2-implementation-and-redesign.md` §7 / `docs/2026-07-07-phase-3-through-6-decomposition.md` §3)。

現在の `agents.yaml` は 1 agent が生の CLI 呼び出しを持つ形式:

```yaml
agents:
  - name: claude
    command: claude
    args: [--dangerously-skip-permissions, -p, /ithy-opsx:apply ${change_id}]
```

この形は Claude 決め打ちで、agent を増やすたびに `--dangerously-skip-
permissions` などの Claude 固有 flag を各 agent に書き写す必要がある。また
runtime のケイパビリティ (`interactive: true / false` / artifact 出力可 /
diff 抽出方法) を宣言する場所がなく、Phase 3 以降の dispatcher / config UI
が判断材料を欠く。

**Runtime abstraction** を導入し、agents.yaml を「runtime 定義」と「role
定義」の 2 軸に整理する。runtime は「実行方法 (CLI + prompt 形式 +
capabilities)」を、agent は「role + どの runtime を使うか + prompt template」を
持つ。

## What Changes

### 1. `runtimes:` section を新設

`agents.yaml` に `runtimes:` を追加。1 entry で 1 runtime を宣言:

```yaml
runtimes:
  claude:
    command: claude
    baseArgs: [--dangerously-skip-permissions]
    promptStyle: cli-arg          # prompt を CLI 引数として渡す
    promptFlag: -p                # prompt の直前に置く flag
    supports:
      interactive: true
      artifactOutput: true
      diff: git

  aider:
    command: aider
    baseArgs: [--yes-always, --no-auto-commit]
    promptStyle: cli-arg
    promptFlag: --message
    supports:
      interactive: false
      artifactOutput: true
      diff: aider-native

  copilot:
    command: gh
    baseArgs: [copilot, suggest]
    promptStyle: stdin
    supports:
      interactive: false
      artifactOutput: false
      diff: none
```

### 2. Agent 定義に `runtime` と `prompt` を追加

既存の `command` + `args` 前提の agent はそのまま動く (後方互換)。
新しい agent は runtime + prompt で書ける:

```yaml
agents:
  # 既存形式 (壊さない)
  - name: claude
    command: claude
    args: [--dangerously-skip-permissions, -p, /ithy-opsx:apply ${change_id}]
    role: apply
    dedicated: false

  # 新形式
  - name: claude-impl
    runtime: claude              # runtimes.claude を参照
    role: apply
    prompt: /ithy-opsx:apply ${change_id}
    dedicated: false

  - name: aider-impl
    runtime: aider
    role: apply
    prompt: |
      Implement tasks in openspec/changes/${change_id}/tasks.md
    specialties: [python]
    dedicated: false
```

Runtime 系フィールドは agent が **`runtime` + `prompt` を持つ** か
**`command` + `args` を持つ** かの二者択一。両方 or どちらも無しは
validation error。

### 3. Registry の resolve を拡張

現行 `AgentRegistry.resolve()` は `{ args, env, initialInput }` を return
するが、command を返さない (呼び出し側 runner が `def.command` を直接
読んでいる)。**Runtime 抽象化に伴い `{ command, args, env, initialInput }` を
return** に変更する。

- Legacy agent (`command + args`): resolved.command = def.command / resolved.args = 解決済 args
- Runtime-backed agent (`runtime + prompt`):
  - runtimes[def.runtime] を look up (不在なら error)
  - resolved.command = runtime.command
  - resolved.args = [...runtime.baseArgs, ...(promptFlag ? [promptFlag] : []), resolvedPrompt]
    - ただし `promptStyle: stdin` の場合は prompt を args に入れず initialInput に流す
  - 全 string に対して既存の `${change_id}` / `${worktree_path}` / `${branch}` template 展開

### 4. `server/agents/runner.ts` の adapt

`runner.ts` の `const child = spawnChild(def.command, finalArgs, ...)` の
`def.command` を `resolved.command` に差し替え。`resolved.args` は既存の
`resolved.args` そのまま。`resolved.initialInput` のロジックは既存の
`-p "<initialInput>"` 挿入をそのまま流用 (Claude 固有だが legacy 挙動保持)。

**Note**: Phase 4 で Manager が `runtime: aider` を dispatch する時に
`initialInput` の Claude 固有 `-p` 挿入がぶつかる可能性がある。今回の
change は「既存挙動を壊さず、非 Claude runtime の受け皿を作る」ところ
までを目標として、`initialInput` 側の runtime-aware 化は
`add-dispatch-endpoint` (Phase 3.2) で dispatched worker の初期プロンプト
モデルを刷新する時に一緒に対応する。

### 5. Runtime lookup の failure モード

- `agents.yaml` の runtimes: が全く無い → OK (legacy agents.yaml として動く)
- Agent が `runtime: <name>` を持つが runtimes に該当 name 無し → 起動時 error banner (既存の malformed agents.yaml 挙動と同じ)
- Agent が `runtime` と `command` の両方持つ、または prompt と args の両方持つ → validation error
- Agent が `runtime` あるが `prompt` 無し (or 逆) → validation error

### 6. Tests

新規 `server/agents/registry-runtime.test.ts`:
- Runtime section の parse: 正常 / 欠損フィールド / 未知 promptStyle
- Runtime-backed agent の resolve: cli-arg / stdin / promptFlag あり/なし
- Backward compat: 既存 command+args agent が引き続き動く
- 排他バリデーション: runtime+command 混在で error / runtime+args 混在で error
- Runtime lookup 失敗: unknown runtime name 参照で error

既存 `server/agents/registry.test.ts` および `server/agents/registry-initial-input.test.ts` は既存 shape で書かれており、AgentDef の型拡張だけなので影響最小。resolve の return 型が広がるので、それに合わせた assertion 更新のみ。

## Backward Compatibility

- 既存 `agents.yaml` (この repo のもの + サンプル project のもの) は
  **一切変更なしで動く**
- `runtimes:` section が無い agents.yaml も OK (loading エラーにしない)
- `agents[].command + args` 形式の agent は spawn 経路を通ってそのまま起動
- `agents[].dedicated / specialties / role / concurrency / initialInput` は既存挙動保持

## Out of scope

- `runtimes.<name>.supports` の consumer 実装 — 単に宣言を parse するだけ。
  実際の diff 抽出方法分岐や interactive 判定は後続 change で消費
- Runtime のインストール検出 — `add-runtime-detection` (Phase 3.3) で実装
- `agents.yaml` の Config UI からの編集 — Phase 5 の
  `add-agents-config-ui` / `add-agents-config-write` で実装
- Runtime の cost 可視化 — Phase 3.5 の Fusion idea note で議論
- 既存 `claude` agent の rename (`claude` → `claude-impl` 等) — 別 change に切り出す判断は Phase 4 の Manager skill 導入時に一緒に

## Impact

- `agents.yaml`: 変更なし (opt-in で `runtimes:` を追加可)
- `server/agents/registry.ts`: 型拡張 + validate 追加 + resolve return 型変更
- `server/agents/runner.ts`: `def.command` → `resolved.command` の 1 か所差し替え
- 新規 `server/agents/registry-runtime.test.ts`: ~10-15 tests
- 既存 `server/agents/registry.test.ts` / `registry-initial-input.test.ts`: resolve return 型変更で assertion 更新 (5-10 箇所)
- `docs/2026-07-07-phase-3-through-6-decomposition.md` §3.1 の内容を実装として反映
