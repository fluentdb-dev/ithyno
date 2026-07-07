## 1. Registry — 型と validate 拡張

- [x] 1.1 `RuntimeDef` 型を新設 (`name / command / baseArgs / promptStyle / promptFlag? / supports`)
- [x] 1.2 `RuntimeSupports` 型 (`interactive / artifactOutput / diff`)
- [x] 1.3 `AgentDef` に optional `runtime? / prompt?` を追加、`command / args` を optional 化
- [x] 1.4 `validateRuntimes(raw)` 実装 — 未知 key / promptStyle enum / diff enum / supports 型を検証
- [x] 1.5 `validateAgents` 拡張 — legacy shape / runtime shape の排他バリデーション
- [x] 1.6 `AgentConfig` 型に `runtimes: Record<string, RuntimeDef>` を追加、`load()` で cache に格納
- [x] 1.7 `AgentRegistry.runtimes()` accessor と `publicConfig().runtimes` を追加

## 2. Registry — resolve の return 型変更

- [x] 2.1 `resolve()` return 型に `command: string` フィールドを追加
- [x] 2.2 Legacy branch: `def.command / def.args` からそのまま組み立て
- [x] 2.3 Runtime-backed branch:
  - `cli-arg`: `[...baseArgs, ...(promptFlag ? [promptFlag] : []), resolvedPrompt]`
  - `stdin`: `args = baseArgs`、`initialInput = resolvedPrompt` (explicit initialInput 優先)
  - `file`: throw "not yet supported"
- [x] 2.4 Template 展開 (`${change_id}`, `${worktree_path}`, `${branch}`) を prompt / baseArgs 両方に適用

## 3. Runner — 呼び出し側 update

- [x] 3.1 `runner.ts` L399, L421, L436 の `def.command` を `resolved.command` に差し替え
- [x] 3.2 Runtime lookup 失敗 (`resolve` throw) を try/catch し `{ ok: false, status: 400 }` を返す
- [x] 3.3 spawn ログと transcript 先頭も `resolved.command` を出力

## 4. Registry テスト — 新規 `registry-runtime.test.ts`

- [x] 4.1 Runtime section の parse — 正常系 3 fields
- [x] 4.2 Runtime section — 欠損 command で error
- [x] 4.3 Runtime section — 未知 promptStyle で error
- [x] 4.4 Runtime section — 未知 supports.diff で error
- [x] 4.5 Runtime section — 未知 key で error
- [x] 4.6 Runtime section 無しの agents.yaml も動く
- [x] 4.7 `runtime + prompt` shape 受理
- [x] 4.8 `runtime + command` 混在 で error
- [x] 4.9 `runtime + args` 混在 で error
- [x] 4.10 `runtime` あるが `prompt` 無しで error
- [x] 4.11 `prompt` あるが `runtime` 無しで error
- [x] 4.12 どちらの shape も無しで error
- [x] 4.13 Legacy agent の resolve — command + args そのまま
- [x] 4.14 `cli-arg + promptFlag` の resolve
- [x] 4.15 `cli-arg`, `promptFlag` 無しの resolve
- [x] 4.16 aider などの別 runtime の resolve
- [x] 4.17 `stdin` promptStyle: baseArgs + initialInput
- [x] 4.18 `stdin` + explicit initialInput: explicit wins
- [x] 4.19 Template 展開 (`${change_id}`, `${worktree_path}`, `${branch}`)
- [x] 4.20 Unknown runtime lookup で throw
- [x] 4.21 `promptStyle: file` で "not yet supported" throw

## 5. 既存テストの assertion 更新

- [x] 5.1 `registry.test.ts` — `resolve` return 型に `command` 追加、既存 assertion は変更不要 (positive assertion で拡張フィールドを許容)
- [x] 5.2 `registry-initial-input.test.ts` — 同上

## 6. Spec delta

- [x] 6.1 `openspec/changes/add-runtime-abstraction/specs/dashboard/spec.md` に 3 ADDED requirements
- [x] 6.2 `npm run openspec -- validate add-runtime-abstraction` VALID

## 7. Manual verification

- [ ] 7.1 現行 `agents.yaml` を dev server 起動で読み込み、error 出ないこと — DEFERRED to post-merge smoke
- [ ] 7.2 サンプル project に runtimes を書いて runtime-backed agent を試す — DEFERRED
- [ ] 7.3 malformed 挙動 — DEFERRED

## 8. Verification

- [x] 8.1 `npm test && npm run typecheck && npm run build` clean (183 tests、+21)
- [x] 8.2 新規 test count — `registry-runtime.test.ts` に 21 tests、既存 test file の増分は無し

## 9. Post-impl

- [x] 9.1 phase-workflow branch へ merge — merge step で実施
- [x] 9.2 archive → phase-workflow に archive commit — archive step で実施
- [x] 9.3 次 change (add-dispatch-endpoint) は次担当
