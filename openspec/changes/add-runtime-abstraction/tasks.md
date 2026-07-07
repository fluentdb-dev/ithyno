## 1. Registry — 型と validate 拡張

- [ ] 1.1 `RuntimeDef` 型を新設: `{ name: string; command: string; baseArgs: string[]; promptStyle: "cli-arg" | "stdin" | "file"; promptFlag?: string; supports: RuntimeSupports }`
- [ ] 1.2 `RuntimeSupports` 型: `{ interactive: boolean; artifactOutput: boolean; diff: "git" | "aider-native" | "none" }`
- [ ] 1.3 `AgentDef` に optional `runtime?: string` と `prompt?: string` を追加。既存の `command / args` は optional 化 (either-or)
- [ ] 1.4 `validateRuntimes(raw)` 実装: `runtimes:` section を parse、未知フィールド拒否、`promptStyle` enum 検証、`supports.diff` enum 検証
- [ ] 1.5 `validateAgents` 拡張:
  - `agent.runtime` と `agent.prompt` が両方あり `command / args` は無いこと (runtime-backed)
  - **または** `agent.command` と `agent.args` があり `runtime / prompt` は無いこと (legacy)
  - どちらでもない or 両方混在は error
- [ ] 1.6 `AgentConfig` 型に `runtimes: Record<string, RuntimeDef>` を追加、`load()` で cache に格納

## 2. Registry — resolve の return 型変更

- [ ] 2.1 `resolve(def, vars)` の return 型を `{ command: string; args: string[]; env; initialInput }` に変更
- [ ] 2.2 Legacy agent branch: `command = def.command`、`args = 解決済 def.args`
- [ ] 2.3 Runtime-backed agent branch:
  - `runtimes[def.runtime!]` を look up、不在なら throw
  - `command = runtime.command`
  - Template 展開後の prompt を組み立て
  - `promptStyle === "cli-arg"`: `args = [...runtime.baseArgs, ...(promptFlag ? [promptFlag] : []), resolvedPrompt]`
  - `promptStyle === "stdin"`: `args = [...runtime.baseArgs]`、`initialInput = resolvedPrompt` (既存の initialInput と衝突する場合は def.initialInput 優先で warn)
  - `promptStyle === "file"`: 予約、Phase 3.1 では throw "not yet supported"
- [ ] 2.4 Template 展開は既存の `${change_id} / ${worktree_path} / ${branch}` に加え、必要に応じて `${prompt_suffix}` の予約 (Phase 3.2 で使う)

## 3. Runner — 呼び出し側 update

- [ ] 3.1 `server/agents/runner.ts` L399, L421, L436 の `def.command` を `resolved.command` に差し替え
- [ ] 3.2 spawn ログ (L399) も `resolved.command` を出力
- [ ] 3.3 既存の `initialInput → "-p" 挿入` ロジック (L395-398) はそのまま。Runtime-backed で `promptStyle: stdin` 経由の initialInput ケースは Phase 3.2 で dispatched worker が spawn される際に adapt する (今回は legacy 挙動保持)

## 4. Registry テスト — 新規 `registry-runtime.test.ts`

- [ ] 4.1 Runtime section の parse — 正常系: 3 runtime 定義が正しく AgentConfig に載る
- [ ] 4.2 Runtime section の parse — 欠損: `command` 無しで error
- [ ] 4.3 Runtime section の parse — 未知 `promptStyle` で error
- [ ] 4.4 Runtime section の parse — 未知 `supports.diff` で error
- [ ] 4.5 Runtime-backed agent の validate — `runtime + prompt` OK
- [ ] 4.6 Runtime-backed agent の validate — `runtime + args` は error (排他)
- [ ] 4.7 Runtime-backed agent の validate — `command + prompt` は error
- [ ] 4.8 Runtime-backed agent の validate — `runtime` あるが `prompt` 無しで error
- [ ] 4.9 Runtime lookup — agent が `runtime: nonexistent` を持つ時、resolve で throw
- [ ] 4.10 Resolve — legacy agent: command + args がそのまま return
- [ ] 4.11 Resolve — cli-arg + promptFlag: `[baseArgs..., promptFlag, prompt]` の順で組み立て
- [ ] 4.12 Resolve — cli-arg + promptFlag 無し: `[baseArgs..., prompt]`
- [ ] 4.13 Resolve — stdin: args は baseArgs のみ、initialInput に prompt が入る
- [ ] 4.14 Resolve — template 展開が prompt / baseArgs 内で機能する

## 5. 既存テストの assertion 更新

- [ ] 5.1 `server/agents/registry.test.ts` — `resolve` の return 型変更に追随 (command フィールド追加)
- [ ] 5.2 `server/agents/registry-initial-input.test.ts` — 同上

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-runtime-abstraction/specs/dashboard/spec.md` に **ADDED Requirements** で 3 件:
  - **Runtime Definitions In agents.yaml** — runtimes: section の shape と validate ルール
  - **Runtime-Backed Agents** — `runtime + prompt` shape、排他バリデーション、resolve 挙動
  - **Backward Compatibility With Command-Based Agents** — 既存 `command + args` 形式は不変
- [ ] 6.2 `npm run openspec -- validate add-runtime-abstraction` が VALID

## 7. Manual verification

- [ ] 7.1 現行 `agents.yaml` (repo 内) が変更なしで既存挙動を保つ — dev server 起動 → Kanban で claude agent 認識される
- [ ] 7.2 サンプル project の `agents.yaml` に runtimes: を追加し、`claude-impl` runtime-backed agent を書いてみて起動できることを確認
- [ ] 7.3 malformed 挙動: `runtime: unknown` を書いて起動、error banner が Kanban 上部に出て他機能は生きていることを確認

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.2 新規 test count 確認 (test files 増 1、tests +14 前後の想定)

## 9. Post-impl

- [ ] 9.1 phase-workflow branch へ merge (worktree で作業した場合)
- [ ] 9.2 archive → phase-workflow に archive commit を積む
- [ ] 9.3 次 change (add-dispatch-endpoint) の scaffolding は次 change の担当
