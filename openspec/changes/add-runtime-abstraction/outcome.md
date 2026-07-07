# Outcome — add-runtime-abstraction

## ✅ Worked

- **`command` フィールドを resolve return に追加**するだけで既存
  runner.ts の 3 箇所差し替えが 3 行の変更で済んだ。既存呼び出し側は
  runtime を意識せず、resolved の shape が広がっただけで済む design
  にできた。
- **Mutual exclusion バリデーションを load 時点で強く効かせた** — legacy
  shape / runtime shape の混在や欠損は全部 error banner。runtime lookup
  の失敗だけは spawn 時 (`resolve` 内 throw) — load 時にはまだ runtimes と
  agents を独立に見ているので runtime name の解決は後ろに回した。この分割は
  spec に沿っているし、hot reload 時に「今日 runtime を消したが agent は
  次に spawn されるまで気付かない」ケースも自然にカバーできる。
- **Runner の error return を Response 化** — `resolve` throw を try/catch
  で `{ ok: false, status: 400, reason }` として返す。既存の 409 / 400 / 500
  エラー return と同じ shape。spawn 前の failure なのでプロセスも起動しない。
- **Test 21 個**を新規 file に集中させたので、既存 registry.test.ts
  (19) と registry-initial-input.test.ts は 1 行の変更も無しで通った。
  `resolve` return の shape 拡張は positive assertion (`toEqual` on
  `r.args`) を壊さない。
- **YAML flow list の quote 忘れ** で 1 個テストが FAIL したのは自業自得。
  既存 test file の pattern (`args: ["/opsx:apply", "\${change_id}"]`) を
  合わせて quote 化して直した。学び: `-p` `/opsx:apply` などのハイフン
  始まり / スラッシュ始まりトークンは YAML flow list で quote 必須。
- **spec の "Runtime-Backed Agents" が MAY で始まっていて validate に落ちた** —
  RFC 2119 keyword は SHALL/MUST が必要。冒頭を "The system SHALL support …"
  に書き換えて 1 発通過。

## ⚠️ Surprises

- **stdin promptStyle の initialInput 衝突**を仕様に書くのを最後まで
  忘れかけた。既存の add-agent-initial-input で agent が
  `initialInput: "..."` を直接持つケースがある。runtime-backed かつ
  stdin なら prompt が initialInput になるべきだが、explicit initialInput
  があればそれを優先する形にした。テスト
  (`stdin: explicit initialInput wins over prompt`) で押さえた。この
  判断は spec の "Runtime-Backed Agents" scenario "runtime-backed agent
  resolves via stdin" では触れていない (initialInput=resolvedPrompt と
  だけ書いた)。Phase 4 で Manager が worker を spawn する時に explicit
  initialInput を使う予定があれば明示化する。
- **`AgentConfig` に `runtimes` フィールドを増やしたので `publicConfig()`
  の return shape が変わった**。UI 側 (`web/src/pages/Agents.tsx`) は今の
  ところ `runtimes` を読んでいないので壊れない、が Phase 3.3
  (`add-runtime-detection`) と Phase 5 (`add-agents-tab-live-panel`) で
  `runtimes` を UI に流す時に web/src/types.ts の AgentConfig 型も同期
  する必要がある。

## 🔁 Differently

- **`describe` を 4 グループに分けた** (`runtimes section` / `runtime-backed
  agent validation` / `resolve — legacy` / `resolve — runtime-backed`) が、
  最後の group が 8 tests 大きく、`stdin: explicit initialInput wins over
  prompt` の shape を書くのに 20 行かかった。次回は helper (loadClaudeRuntimeRegistry) を
  1 個作って use case を薄く並べる方向が clean。
- **`agents.yaml` の実 file をこの change では触っていない**。Phase 4 で
  Manager を導入する時に `agents.yaml` の shape 変更 (default agent の
  runtime 化 or 追加 agent) は別 change で。

## 🌱 Follow-ups

- **`add-runtime-detection` (Phase 3.3)** — `which <cmd>` で installed
  判定、`GET /api/agents/runtimes` を追加。今回 `runtimes()` accessor を
  もう追加してあるので endpoint 側の実装は薄い
- **`add-dispatch-endpoint` (Phase 3.2)** — `POST /api/agents/dispatch` +
  `/opsx:dispatch` slash。role で agents を絞り込む selector を書く
- **`agents.yaml` の default agent を runtime-backed に refactor** — Phase 4
  で Manager が入る時に既存 `claude` (legacy shape) を `claude-impl`
  (runtime: claude) に書き換える判断が必要。今回の change 単独では触らない
- **`web/src/types.ts` の AgentConfig 同期** — Phase 3.3 で必要になる

## Notes

- Registry.ts の LOC 増加: 約 +160 (RuntimeDef 型 + validateRuntimes +
  resolve の runtime branch)、既存関数は net 変わらず
- Runner.ts の LOC 変化: +8 (try/catch 追加、`def.command` → `resolved.command`
  3 か所)
- Registry-runtime.test.ts 新規: 400 LOC 弱、21 tests
- 既存 test file への変更: 0 行
- Tests total: 162 → 183 (+21)
- Typecheck / build clean
