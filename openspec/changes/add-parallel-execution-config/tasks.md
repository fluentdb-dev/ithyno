# Tasks — add-parallel-execution-config

## 1. Server

- [x] 1.1 `server/agents/registry.ts`: `parallelExecution: boolean` を top-level parse に追加、AgentConfig 型 + `publicConfig()` の返却 shape に含める (default `false`)
- [x] 1.2 Non-boolean value 拒否のエラーメッセージ
- [x] 1.3 新 endpoint `POST /api/config/parallel-execution` `{value: boolean}` — `writeParallelExecution` helper で surgical yaml write
- [x] 1.4 endpoint 応答後、`agents-updated` broadcast (既存の debounced watcher 経由; `parallelExecution` を payload に追加)

## 2. Server tests

- [x] 2.1 `server/agents/registry.test.ts`: parallelExecution default false / true 受け入れ / 非 boolean 拒否 の 3 test 追加
- [ ] 2.2 Settings endpoint smoke test (integration) — 手動 verify (6.2/6.3) で cover; 自動 integration は follow-up 扱い

## 3. Client types + API

- [x] 3.1 `web/src/types.ts`: `AgentConfigResponse` に `parallelExecution: boolean` 追加
- [x] 3.2 `web/src/api.ts`: `setParallelExecution(value: boolean)` client 関数

## 4. Start flow

- [x] 4.1 `web/src/hooks/useStartFlow.tsx`: ExecutionPicker state / render 撤去、config 値で分岐
- [x] 4.2 `web/src/components/ExecutionPicker.tsx`: file 削除
- [x] 4.3 `web/src/styles.css`: `.execution-picker` / `.execution-option*` / 関連 class 削除

## 5. Settings tab

- [x] 5.1 `web/src/pages/Settings.tsx`: 新規 page component、config 値の checkbox
- [x] 5.2 `web/src/App.tsx`: `<NavLink to="/settings">Settings</NavLink>` + `<Route path="/settings" element={<Settings />} />` 追加
- [x] 5.3 保存後の toast + `agents-updated` broadcast 経由の再取得動作確認 — WS handler で `parallelExecution` を state に反映

## 6. Verify

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean (218 pass / 1 skip, tsc clean, build clean)
- [ ] 6.2 手動: `agents.yaml` に `parallelExecution: true` を書いて Kanban Start → picker 出ずに worktree spawn
- [ ] 6.3 手動: `parallelExecution: false` (default) で Kanban Start → picker 出ずに terminal inject
- [ ] 6.4 手動: proposal.execution override が優先されることの確認 (worktree save 済み change を default false で試す)

## 7. Post-impl

- [x] 7.1 phase-workflow へ merge (worktree flow) — N/A: in-place impl
- [x] 7.2 outcome.md
- [ ] 7.3 `/ithy-opsx:archive add-parallel-execution-config`
