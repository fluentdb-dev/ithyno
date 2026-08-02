# Tasks

## 1. Server-side mutable project root

- [x] 1.1 In `server/index.ts`, replace `const PROJECT_ROOT = ...` with a `let currentProjectRoot`, exposed via `getProjectRoot()` and mutated via `setProjectRoot(next: string)`.
- [x] 1.2 `setProjectRoot(next)` also re-resolves `openspecDir` from the new root (reuse the existing mutable-`openspecDir` machinery from `refactor-import-to-task-tool-subagent`).
- [x] 1.3 Convert every in-file reader of `PROJECT_ROOT` to `getProjectRoot()`. Grep to catch all sites (roughly 40 references — /api/state, sidecar, needs-human, watcher, git-status, agents.yaml load).

## 2. `POST /api/project/switch` endpoint

- [x] 2.1 Register `POST /api/project/switch` in `server/index.ts`. Body validation: `{ projectRoot: string }` — reject 400 on missing / non-string / non-absolute / non-existent / non-directory.
- [x] 2.2 Authorization: reuse the path allow-list from `server/import-spec-gen.ts` (reject 403 on `/usr`, `/etc`, `/System`, `/private`, `/var`, `/Library`).
- [x] 2.3 Concurrency: module-level `switchInProgress: boolean` flag. Second concurrent call → 409. Cleared in `finally`.
- [x] 2.4 On accept: `await terminateAllLivePtys()`, `setProjectRoot(next)`, broadcast `state-replaced`, return 200 `{ projectRoot: next }`.

## 3. PTY termination helper

- [x] 3.1 In `server/sync/pty.ts`, add exported `terminateAllLivePtys(): Promise<void>` that walks the module-level `live: LiveTerminal[]` array. For each entry: `entry.term.kill()` and `entry.ws.close(1000, "project switch")`. Await a short bounded settle time so the kills flush.

## 4. `/pty` WebSocket handler dynamic cwd

- [x] 4.1 In `server/index.ts` (around the `ptyWss.on("connection", ...)` block, currently ~line 1692), replace the `PROJECT_ROOT` closure read with `getProjectRoot()`. Verify `openspecDir` is already read dynamically (yes — from `refactor-import-to-task-tool-subagent`).

## 5. Tests

- [x] 5.1 `server/project-switch.test.ts` (new): endpoint preflight rejections (400 non-existent, 400 non-directory, 403 unauthorized), 409 on concurrent, and happy-path success. Mock `terminateAllLivePtys` where useful.
- [x] 5.2 `server/sync/pty.test.ts`: add cases asserting `terminateAllLivePtys` kills all + closes WS with the expected close code / reason. Empty `live` array is a no-op.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate respawn-manager-pty-on-project-switch --strict` passes.
- [x] 6.2 `npm test` passes (pre-existing `build-icons` sharp failure OK — same as develop).
- [x] 6.3 `npm run typecheck` passes.
- [x] 6.4 `npm run build` passes.
- [ ] 6.5 Manual (CLI `npm run dev`): launch from `/path/A` → `curl -X POST localhost:4321/api/project/switch -d '{"projectRoot":"/path/B"}'` → Terminal panel reconnects → `pwd` reports `/path/B` → `/opsx:propose test-change` in Manager PTY creates scaffold at `/path/B/openspec/changes/test-change/`.
- [x] 6.6 Write `openspec/changes/respawn-manager-pty-on-project-switch/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups: Electron `switchProject()` rewrite, VS Code workspace listener, dashboard UI trigger.
