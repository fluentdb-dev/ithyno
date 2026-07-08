## 1. Detection module — `server/agents/runtime-detect.ts` (新規)

- [x] 1.1 `DetectionResult` 型を export
- [x] 1.2 `detectRuntime()` — `which <cmd>` を子プロセスで実行、exit 0 → installed + path、非 0 → error
- [x] 1.3 `detectAllRuntimes()` — 同じ command は uniqueCommands set で 1 回のみ実行、runtime 名 → DetectionResult map を返す
- [x] 1.4 Windows: `isWindows()` で判定、全 runtime に windows sentinel を返す

## 2. Endpoint — `server/index.ts`

- [x] 2.1 `GET /api/agents/runtimes` を追加、`isLocal` guard
- [x] 2.2 Registry の `publicConfig().runtimes` を読み、`detectAllRuntimes` を通して RuntimeStatusResponse を組み立て
- [x] 2.3 `?refresh=1` / `?refresh=true` で detection cache を bypass、再検出
- [x] 2.4 空 runtimes 時は `{ runtimes: [] }` を即返す

## 3. Tests — `server/agents/runtime-detect.test.ts` (新規)

- [x] 3.1 `detectRuntime("echo")` → installed: true、path が /-始まり (POSIX 標準)
- [x] 3.2 `detectRuntime("this-command-should-not-exist-xyz-abc-42")` → installed: false、error
- [x] 3.3 `detectAllRuntimes({})` → 空 object
- [x] 3.4 mix of installed + missing で正しく分岐
- [x] 3.5 同 command 2 runtime で path が同一 (cache 検証)
- [x] 3.6 Windows platform → 全 entry に "windows detection not supported"

## 4. Spec delta

- [x] 4.1 `openspec/changes/add-runtime-detection/specs/dashboard/spec.md` に 2 ADDED requirements
- [x] 4.2 `npm run openspec -- validate add-runtime-detection` VALID

## 5. Manual verification

- [ ] 5.1 dev server 起動 + `curl http://localhost:4321/api/agents/runtimes` — 現行 agents.yaml では runtimes: 未定義なので `{ runtimes: [] }` — DEFERRED to post-merge smoke
- [ ] 5.2 サンプル `runtimes:` を追加、endpoint が installed 状況を報告 — DEFERRED

## 6. Verification

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean (211 tests、+7)
- [x] 6.2 新規 test count — runtime-detect.test.ts 7 tests

## 7. Post-impl

- [x] 7.1 phase-workflow branch へ merge — merge step で
- [x] 7.2 archive → phase-workflow に archive commit — archive step で
- [x] 7.3 次: Phase 3.4 `extend-agent-job-model`
