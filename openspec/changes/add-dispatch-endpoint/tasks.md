## 1. Selector — `server/agents/dispatch.ts`

- [ ] 1.1 新規 module `server/agents/dispatch.ts` を作る
- [ ] 1.2 `type DispatchQuery = { role, changeId, runtime?, changeTags? }` を定義
- [ ] 1.3 `selectAgent(registry, query, changeTagsFn?): AgentDef | { error, matches: AgentDef[] }` 関数
  - role match、specialties match (any/空 → wildcard、それ以外 → intersect >= 1)、runtime filter
  - 順序は agents.yaml の並び (find の順序)
  - 該当なしは error + 空 matches、複数該当は最初を採用
- [ ] 1.4 `resolveChangeTags(projectRoot, changeId)` — change の proposal.md frontmatter から tags を読む (存在しなければ空配列)

## 2. Wait semantics — `server/agents/dispatch.ts` 続き

- [ ] 2.1 `dispatch(runner, registry, projectRoot, body): Promise<DispatchResponse>` 関数
- [ ] 2.2 wait=false: run() 結果の job id を即 return、status=job.status
- [ ] 2.3 wait=true (default): AgentRunner の event を subscribe、対象 job の completed/crashed/cancelled を待つ
- [ ] 2.4 Timeout: default 30 分、超過で `runner.cancel()` + status="timeout"
- [ ] 2.5 完了後 `git status --porcelain` を change worktree で走らせ、`openspec/changes/<changeId>/` 配下の変更ファイルを列挙
- [ ] 2.6 Stdout tail 末尾 4KB を job.output から抜き出し

## 3. Endpoint — `server/index.ts`

- [ ] 3.1 新規 route `POST /api/agents/dispatch` を追加、`isLocal` guard + CSRF onRequest hook 継承
- [ ] 3.2 Body 検証: `role` / `changeId` 必須、`runtime` / `promptSuffix` / `wait` / `timeoutMs` 任意
- [ ] 3.3 400: role/changeId 未指定 or 空
- [ ] 3.4 404: unknown change id、または selector が該当 agent 無し (`no agent matches role=<role>` メッセージ)
- [ ] 3.5 503: agents.yaml が空 (既存 `/api/agents/run` と同じ扱い)
- [ ] 3.6 200: DispatchResponse を return
- [ ] 3.7 promptSuffix は現状 job の template 変数展開に反映する経路を持たない (registry の template は `${change_id} / ${worktree_path} / ${branch}` のみ) — Phase 3.2 では **body に受けるが未使用** で通す。Phase 4 Manager が使い始めた時に registry / runner に流す

## 4. Slash command — `.claude/commands/opsx/dispatch.md`

- [ ] 4.1 新規 file、frontmatter に `description` と `argument-hint`
- [ ] 4.2 Body で curl + JSON build + response parse の指示を書く
- [ ] 4.3 argument parse (role, changeId, --runtime, --prompt-suffix) の擬似コード or 明示的手順
- [ ] 4.4 Response の使い方 (verdict は Phase 3.5 で、今は artifactPaths を読むよう指示)

## 5. Tests — `server/agents/dispatch.test.ts` 新規

- [ ] 5.1 selectAgent — role match で 1 件見つかる (specialties: [])
- [ ] 5.2 selectAgent — specialties intersect で選ばれる (tag [ts] と agent specialties [ts, python])
- [ ] 5.3 selectAgent — specialties [any] は wildcard 動作
- [ ] 5.4 selectAgent — 該当 role 無しで error
- [ ] 5.5 selectAgent — role 有 + specialties 不一致 (tag [python] だが agent specialties [ts]) で error
- [ ] 5.6 selectAgent — runtime filter 指定時、runtime 不一致は除外
- [ ] 5.7 selectAgent — 複数該当は agents.yaml 順で先頭
- [ ] 5.8 resolveChangeTags — proposal.md frontmatter に tags があれば return
- [ ] 5.9 resolveChangeTags — frontmatter 無し or tags 無しで空配列
- [ ] 5.10 dispatch (integration スタイル) — wait=false で job id 即 return (mocked runner)
- [ ] 5.11 dispatch — wait=true で completed 待ちができる (mocked event emitter)
- [ ] 5.12 dispatch — timeout で cancel が呼ばれ status=timeout

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-dispatch-endpoint/specs/dashboard/spec.md` に **ADDED Requirements** 3 件:
  - **Role-Based Agent Dispatch API** — POST /api/agents/dispatch の shape と挙動
  - **Agent Selection By Role And Specialties** — selector の準拠する rule
  - **Synchronous Dispatch With Timeout** — wait=true のセマンティクス
- [ ] 6.2 `npm run openspec -- validate add-dispatch-endpoint` VALID

## 7. Manual verification

- [ ] 7.1 現行 default agent (`claude` legacy shape, role: coder) に対して curl で dispatch (role: coder) が dispatch できることを確認 — post-merge smoke test に defer
- [ ] 7.2 role: nonexistent で 404 と matches 空リストを確認 — 同上
- [ ] 7.3 `/opsx:dispatch coder add-foo` を Claude Code terminal から叩き、Bash + curl 経路が動くことを確認 — 同上

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 8.2 新規 test count — dispatch.test.ts に 12 前後

## 9. Post-impl

- [ ] 9.1 phase-workflow branch へ merge (worktree)
- [ ] 9.2 archive → phase-workflow に archive commit
- [ ] 9.3 次: Phase 3.3 `add-runtime-detection` は並列可能
