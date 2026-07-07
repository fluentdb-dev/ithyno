## 1. Detection module — `server/agents/runtime-detect.ts` (新規)

- [ ] 1.1 `type DetectionResult = { installed: boolean; path?: string; error?: string }` を export
- [ ] 1.2 `detectRuntime(command: string): Promise<DetectionResult>` を実装 — `which <cmd>` を子プロセス実行、exit code 0 で installed + path、非 0 で not-installed
- [ ] 1.3 `detectAllRuntimes(runtimes: Record<string, RuntimeDef>): Promise<Record<string, DetectionResult>>` — 同じ command は 1 回だけ走らせる (cache)
- [ ] 1.4 Windows out-of-scope、`process.platform === "win32"` の時は `{ installed: false, error: "windows detection not supported" }` を全 runtime に返す

## 2. Endpoint — `server/index.ts`

- [ ] 2.1 新規 route `GET /api/agents/runtimes` — `isLocal` guard
- [ ] 2.2 Registry から `runtimes()` を取得、`detectAllRuntimes` で detection を掛け、RuntimeStatusResponse を組み立て
- [ ] 2.3 Query param `?refresh=1` で detection cache を bypass (毎回再検出)
- [ ] 2.4 空 runtimes の場合は `{ runtimes: [] }` を return

## 3. Tests — `server/agents/runtime-detect.test.ts` (新規)

- [ ] 3.1 `detectRuntime("echo")` → installed: true、path が /bin/echo or 相当 (POSIX で普遍的に installed なので safe)
- [ ] 3.2 `detectRuntime("this-command-should-not-exist-xyz")` → installed: false、error message
- [ ] 3.3 `detectAllRuntimes({})` → 空 map
- [ ] 3.4 `detectAllRuntimes({claude: ..., aider: ...})` — 各 command について同時実行
- [ ] 3.5 同じ command を持つ 2 runtime — cache で 1 回のみ叩く (spy で count 検証、実装容易なら)
- [ ] 3.6 Windows platform で全 runtime not-supported (`process.platform` を mock)

## 4. Spec delta

- [ ] 4.1 `openspec/changes/add-runtime-detection/specs/dashboard/spec.md` に **ADDED Requirements** 2 件:
  - **Runtime Installation Detection** — `which <cmd>` 経路、installed / path / error
  - **Runtime Status Endpoint** — `GET /api/agents/runtimes` の shape と挙動
- [ ] 4.2 `npm run openspec -- validate add-runtime-detection` VALID

## 5. Manual verification

- [ ] 5.1 dev server 起動 + `curl http://localhost:4321/api/agents/runtimes` — 現行 agents.yaml では runtimes: 未定義なので `{ runtimes: [] }` — DEFERRED
- [ ] 5.2 サンプル `runtimes:` を追加、endpoint が installed 状況を報告 — DEFERRED

## 6. Verification

- [ ] 6.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 6.2 新規 test count — runtime-detect.test.ts 6 前後

## 7. Post-impl

- [ ] 7.1 phase-workflow branch へ merge
- [ ] 7.2 archive → phase-workflow に archive commit
- [ ] 7.3 次: Phase 3.4 `extend-agent-job-model`
