# Outcome — extend-agent-job-model

## ✅ Worked

- **artifact-scan を独立モジュール化**して runner と dispatch の両方から
  再利用できるようになった。~30 LOC の関数 1 個の module。単独で
  test 可 (実 git 初期化 + tmp dir)、他モジュールへの影響ゼロ。
- **runtimeLabel の 1 か所化**。dispatch.ts に置いていたのを registry.ts
  に移し、runner / dispatch から import。関数移動だけで済み、既存 test の
  import path 修正 (`from "./dispatch.js"` → `from "./registry.js"`) の
  1 行変更で追随。
- **finish() の async 化 + artifactPaths を status flip 前に populate**。
  polling する consumer (dispatch など) が `job.status !== "running"` を
  「done」signal として扱った時、artifactPaths が同時に見えるように
  順序制御した。事前の race 対策になっている。
- **`--untracked-files=all` を発見** (deubg で判明)。素の `git status
  --porcelain` は untracked directory を collapse する
  (`?? openspec/`) ため、review.md / needs-human.md が個別に列挙されない
  という bug が入っていた。テストで気付けたのが助かった。実 dispatch
  経路でも同じ bug が Phase 3.2 landed 時から潜在していた — 今回 fix。
- **web/src/types.ts の JobSummary sync**。role / runtime / artifactPaths を
  追加、コメントに「Client mirror of server/agents/runner.ts's
  JobSummary — hand-synced」と明記。将来 divergence 検出用の hint に
  なる。

## ⚠️ Surprises

- **cancel path が finish を通さない既存挙動** に気付いたが scope を広げず
  そのままに。cancel → SIGTERM → exit 到達時 `job.status !== "running"`
  で finish が呼ばれない。結果として cancelled job は artifactPaths が
  populate されない。spec は "completed | cancelled | crashed" と書いて
  あるが、実装は "completed | crashed" のみ。spec と実装の乖離あり —
  next change (Phase 3.5 or 4) で cancel の cleanup を統一する時に
  対応。実運用では cancel は "abort" 意図なので artifactPaths の欠如は
  実害少ない、と割り切った。
- **`git status --porcelain` の untracked-dir collapse** — POSIX 素の
  git は default で directory を折り畳む。debug で TMPDIR / rm -rf の
  scoping ミスで一瞬 macOS が Operation not permitted の洪水を出したが、
  それを避けて別 command で再テストして原因判明。他 change の
  artifact discovery でも同じ罠がありそうなので、今後は
  `--untracked-files=all` を default にする方針。
- **web/src/util/changeState.test.ts** が JobSummary literal を持って
  いて型変更でコンパイル fail。fixture 関数 `runningJob()` に
  role/runtime を追加するだけで通った。テストが JobSummary の
  factory を再利用する pattern だと 1 か所修正で全 test 追随できる。

## 🔁 Differently

- **runner の統合 test** (spawn → role/runtime 検証、finish → artifactPaths
  検証) は書かなかった。既存 pool.integration.test.ts が git repo を用意
  して agents を spawn するパターンだが、setup が重い (~100 LOC)。
  Phase 3.5 で review-artifact schema を書く時に、review.md を吐く mock
  agent を用意して同じ pattern で押さえる予定。今回は artifact-scan の
  unit test で listChangeArtifacts の contract を担保するに留めた。
- **cancel path の finish 統一** をやりたかったが scope 外。追跡目的の
  memo として outcome にだけ残し、Phase 4 の Manager 統合時に検討。

## 🌱 Follow-ups

- **cancel path の finish cleanup 統一** — cancel が finish 経路を通ら
  ない結果、pool release / locks 解放 / artifactPaths populate が
  すべて起きない。Phase 3.5 か Phase 4 で修正する候補。
- **`--untracked-files=all` を diff API 側にも適用**。既存の
  `extractDiff` (server/agents/diff.ts) は独立の git diff を叩くが、
  untracked を含む場合は同じ罠がありそう。次に diff で
  「review.md が見えない」報告があれば見直す。
- **`agent-job-artifacts-updated` event** — Phase 5.1 で Agents タブが
  finished job の artifactPaths を live 更新表示したい場合、finish の
  一部として emit する event を追加する候補。今回は必要になるまで
  作らない。

## Notes

- 新規 module: `server/agents/artifact-scan.ts` (33 LOC),
  `server/agents/artifact-scan.test.ts` (5 tests)
- Modified: `runner.ts` (+30 LOC for Job type extension + spawn/finish
  wiring), `dispatch.ts` (-40 LOC で `listChangeArtifacts`/`runtimeLabel`
  削除 + Job から読む), `registry.ts` (+10 LOC で runtimeLabel export)
- Web: `types.ts` (+5 LOC で JobSummary mirror + test fixture)
- Tests: 211 → 216 (+5) — artifact-scan 5 new、既存 test 変更なし
- Backward compat: /api/agents/jobs / /api/agents/dispatch response
  shape が 3 field 拡張のみ、削除・変更なし
