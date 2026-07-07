# Outcome — add-dispatch-endpoint

## ✅ Worked

- **Selector を pure function に切り出せた** — `selectAgent(registry, query)`
  は Registry のスナップショットと SelectQuery だけで動く純関数。テストが
  loadWith → selectAgent の 2 step だけで済み、mocking 一切不要。テスト 21
  個の 11 個 (selectAgent 系) がこれで薄く書けた。
- **Polling で wait を実装した割り切り**。AgentRunner の event は
  constructor-injected な emit callback で、subscribe API を持たない。ここに
  EventEmitter を足すのは cross-cutting なので避け、250ms polling +
  deadline check の実装にした。テストは mock runner (`{ getJob, cancel }`)
  で書けて、実装 15 LOC。同期タイムアウトが必要な他 endpoint も同じ
  pattern を借りられる。
- **artifact 検出を git status で済ませた**。change dir 配下の untracked /
  modified を列挙する 12 LOC。Phase 3.5 の review.md schema を待たずに、
  Manager は `artifactPaths` を見て `review.md` `needs-human.md` を読む
  だけで意思決定できる。
- **/opsx:dispatch slash command の "magic ではない" 明記** (Fable review
  HIGH #1 対応)。command body に `Bash + curl` の具体的な手順を書き、
  「connection stays open until worker terminates. Do NOT poll — the
  response arrives when the job ends」で sync semantics を明示。Phase 4 の
  Manager 実装で誤解が起きにくくなる。
- **`runtimeLabel(agent)` を関数として export** した。Legacy agent は
  "legacy" を返す。この 1 行の抽象化のおかげで DispatchResult の runtime
  フィールドが「常に non-null な文字列」の invariant を保てる。UI 側で
  null-check せずに済む。

## ⚠️ Surprises

- **`AgentRegistry.publicConfig()` が env を除いた形で agents を返す** の
  仕様に沿って `selectAgent` は `publicConfig().agents` を読んでいる。
  Env は selection の意思決定には不要なので問題ないが、型上 `as unknown
  as AgentDef` の cast が必要になった。将来 registry に selection 用の
  「pure agent list」getter を追加する余地あり。
- **promptSuffix は body で受けたが registry に流していない**。理由:
  `AgentRegistry.resolve()` の template 変数は `${change_id} /
  ${worktree_path} / ${branch}` のみ。`${prompt_suffix}` を追加するのは
  registry 側の変更で、Phase 3.2 の scope 拡大になる。Manager がまだ
  存在しないので promptSuffix を空にしても影響なし。Phase 4 で Manager が
  実際に使い始めた時に registry 拡張と一緒に対応する。
- **stdio が `["ignore", "pipe", "pipe"]` で stdin 閉じ**は Phase 3.2 で
  触っていない。Fable HIGH #3 の `-p` 注入問題と合わせて、次に非 Claude
  runtime を実運用する時にまとめて対処する。
- **timeoutMs のバリデーション** で `>= 1000 ms` を強制した。テスト 5.5
  も追加したかったがそちらは `dispatch()` の integration test に
  なるので割愛。spec 側 scenario では「invalid timeout rejected」を
  明記している。

## 🔁 Differently

- **Manager 側の polling story を doc に落とす** — dispatch の
  `wait: false` 経路は spec で定義したが、Manager が何秒間隔で
  `/api/agents/jobs/:id` を polling するのが良いかは書いていない。
  Phase 4.1 の Manager prompt 執筆時に「wait: true を使え、polling は
  例外」を明記する。
- **timeout の cancel は best-effort**。Runner の cancel が失敗する
  ケース (子プロセスが SIGTERM を無視 etc) の handling は Phase 3.2 で
  取っていない。運用で問題が顕在化したら retry 付きの
  `graceful-cancel-then-kill` に拡張。

## 🌱 Follow-ups

- **`add-runtime-detection` (Phase 3.3)** — `GET /api/agents/runtimes` を
  追加、runtimes() accessor を露出する薄い endpoint。並列可能。
- **`extend-agent-job-model` (Phase 3.4)** — Job / JobSummary に role /
  runtime / verdict / artifacts を追加。Dispatch response と重複するが
  Job model 側にも同じ情報を持たせて Agents タブから読めるようにする。
- **`add-review-artifact` (Phase 3.5)** — `review.md` schema。DispatchResponse
  に structured verdict フィールドを追加できるようになる。
- **Fable HIGH #3 の runtime-aware `-p` 注入 fix** — 非 Claude runtime を
  実運用する前に必ず。trivial fix、no proposal 必要。
- **promptSuffix の template 展開** — Phase 4 Manager が使い始めた時に
  registry.ts の resolve に `${prompt_suffix}` を追加。

## Notes

- New: `server/agents/dispatch.ts` (302 LOC 前後)、`server/agents/dispatch.test.ts`
  (350 LOC 前後、21 tests)、`.claude/commands/opsx/dispatch.md`
- Modified: `server/index.ts` (+40 LOC で 1 route + import)
- No changes to registry.ts / runner.ts / model.ts (isolation 成功)
- Tests: 183 → 204 (+21)
- Typecheck / build clean
