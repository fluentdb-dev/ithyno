## 1. Selector — `server/agents/dispatch.ts`

- [x] 1.1 新規 module `server/agents/dispatch.ts` を作成
- [x] 1.2 `SelectQuery` / `SelectResult` / `SelectorError` 型定義
- [x] 1.3 `selectAgent()` — role → specialties intersect (any/空は wildcard) → runtime filter → agents.yaml 順
- [x] 1.4 `resolveChangeTags()` — proposal.md frontmatter から tags を読む、無ければ空配列

## 2. Wait semantics — `server/agents/dispatch.ts` 続き

- [x] 2.1 `dispatch()` 関数 — full flow
- [x] 2.2 wait=false: run() 結果を即 return、status: "running"
- [x] 2.3 wait=true (default): `waitForJobCompletion()` で poll、job.status !== "running" で解決
- [x] 2.4 Timeout: default 30 分、超過で `runner.cancel()` + status="timeout"
- [x] 2.5 `listChangeArtifacts()` — 完了後 `git status --porcelain` で change dir 配下変更を列挙
- [x] 2.6 `stdoutTail()` — job.output から末尾 4KB (default) を抽出

## 3. Endpoint — `server/index.ts`

- [x] 3.1 `POST /api/agents/dispatch` を追加、`isLocal` guard + 既存 CSRF hook 継承
- [x] 3.2 Body 検証: role / changeId 必須、runtime / promptSuffix / wait / timeoutMs 任意
- [x] 3.3 400: role/changeId 未指定、timeoutMs 不正
- [x] 3.4 404: change 未存在、selector 空 (matches: [] 付き)
- [x] 3.5 503: agents.yaml が空
- [x] 3.6 200: DispatchResponse を return
- [x] 3.7 promptSuffix は body で受けるが未使用 (Phase 4 で registry / runner に流す)

## 4. Slash command — `.claude/commands/opsx/dispatch.md`

- [x] 4.1 新規 file、frontmatter に description / argument-hint
- [x] 4.2 Body で curl + JSON build + response parse の指示 (Bash tool 経路を明示)
- [x] 4.3 引数 parse 手順 (role, changeId, --runtime, --prompt-suffix)
- [x] 4.4 Response の使い方 — Phase 3.5 まで verdict は artifact 直読み

## 5. Tests — `server/agents/dispatch.test.ts` 新規

- [x] 5.1 selectAgent — role match で 1 件見つかる (wildcard specialties)
- [x] 5.2 selectAgent — role 無し agent → error
- [x] 5.3 selectAgent — TS specialties match で code-ts が選ばれる
- [x] 5.4 selectAgent — Python change で code-python が選ばれる
- [x] 5.5 selectAgent — specialties 有だが tag 不一致で error
- [x] 5.6 selectAgent — [any] wildcard、tags 空でもマッチ
- [x] 5.7 selectAgent — specialties 未指定 (default `[]`) も wildcard 動作
- [x] 5.8 selectAgent — runtime filter で該当 runtime のみ (aider 指定)
- [x] 5.9 selectAgent — 未知 runtime で error
- [x] 5.10 selectAgent — runtime filter 無しは agents.yaml 順の先頭
- [x] 5.11 selectAgent — 複数候補で先頭 (primary vs fallback)
- [x] 5.12 resolveChangeTags — frontmatter に tags があれば return
- [x] 5.13 resolveChangeTags — proposal.md 不在で空配列
- [x] 5.14 resolveChangeTags — frontmatter に tags 無しで空配列
- [x] 5.15 resolveChangeTags — 非 string 混入 は filter
- [x] 5.16 runtimeLabel — runtime-backed は runtime 名
- [x] 5.17 runtimeLabel — legacy は "legacy"
- [x] 5.18 stdoutTail — stdout のみ concat、順序保持
- [x] 5.19 stdoutTail — maxBytes で切り捨て
- [x] 5.20 waitForJobCompletion — mock で status 遷移が拾える
- [x] 5.21 waitForJobCompletion — timeout で cancel 呼ばれる

## 6. Spec delta

- [x] 6.1 `openspec/changes/add-dispatch-endpoint/specs/dashboard/spec.md` に 3 ADDED requirements
- [x] 6.2 `npm run openspec -- validate add-dispatch-endpoint` VALID

## 7. Manual verification

- [ ] 7.1 dev server 起動 + curl で dispatch (role: coder) が動く — post-merge smoke に defer
- [ ] 7.2 role: nonexistent で 404 + matches: [] — 同上
- [ ] 7.3 `/opsx:dispatch coder add-foo` を Claude Code terminal から — 同上

## 8. Verification

- [x] 8.1 `npm test && npm run typecheck && npm run build` clean (204 tests、+21)
- [x] 8.2 新規 test count — dispatch.test.ts 21 tests

## 9. Post-impl

- [x] 9.1 phase-workflow branch へ merge — merge step で
- [x] 9.2 archive → phase-workflow に archive commit — archive step で
- [x] 9.3 次: Phase 3.3 add-runtime-detection は並列可能
