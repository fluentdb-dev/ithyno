# Tasks

## 1. Server-side mutable project root

- [ ] 1.1 In `server/index.ts`, replace `const PROJECT_ROOT = ...` with a `let currentProjectRoot`, exposed via `getProjectRoot()` and mutated via `setProjectRoot(next: string)`.
- [ ] 1.2 `setProjectRoot(next)` also re-resolves `openspecDir` from the new root and updates the module-level `openspecDir` var.
- [ ] 1.3 Refactor all in-file readers of `PROJECT_ROOT` to call `getProjectRoot()` — approximately 40 call sites across `/api/state`, sidecar reads, needs-human reads, watcher setup, git-status calls, agents.yaml load. Grep and convert.
- [ ] 1.4 Add a `no-restricted-syntax` lint rule (or a smoke test that greps) preventing new code from importing the mutable var directly — force everyone through `getProjectRoot()`.

## 2. `POST /api/project/switch` endpoint

- [ ] 2.1 Register `POST /api/project/switch` in `server/index.ts` (or a new `server/project-switch.ts` module).
- [ ] 2.2 Body validation: `{ projectRoot: string }`. Reject 400 on missing / non-string / non-absolute / non-existent / non-directory.
- [ ] 2.3 Authorization: reuse the path allow-list from `server/import-spec-gen.ts` — reject 403 on system paths (`/usr`, `/etc`, `/System`, `/private`, `/var`, `/Library`).
- [ ] 2.4 Concurrency guard: a module-level `switchInProgress: boolean` (or `Promise | null`). Second concurrent call → 409.
- [ ] 2.5 On accept:
  - Walk `server/sync/pty.ts` `live: LiveTerminal[]` — for each entry, `entry.term.kill()` and `entry.ws.close(1000, "project switch")`. Wait for kill to settle (short bounded await).
  - `setProjectRoot(next)`.
  - Broadcast `state-replaced` on the existing state WS.
  - Clear the `switchInProgress` flag.
  - Return 200 `{ projectRoot: next }`.
- [ ] 2.6 Errors after `setProjectRoot` clear the flag in `finally` — no permanent stuck-in-switch state.

## 3. `/pty` WebSocket handler dynamic cwd

- [ ] 3.1 In `server/index.ts:1692` (the `ptyWss.on("connection", ...)` block), replace the `PROJECT_ROOT` closure read with `getProjectRoot()`. Verify the current call already reads `openspecDir` dynamically via the module-level `openspecDir` var (yes, from prior `refactor-import-to-task-tool-subagent`).

## 4. Dashboard trigger

- [ ] 4.1 `web/src/components/NoProjectDecisionPanel.tsx` — the Initialize path already calls `POST /api/init`. No change needed here; `/api/init` already runs on the current PROJECT_ROOT.
- [ ] 4.2 Add a helper `web/src/api.ts` `switchProject(projectRoot: string): Promise<void>` that POSTs `/api/project/switch` and awaits the response.
- [ ] 4.3 The existing dashboard-side Open Project trigger (Electron menu / VS Code command / any other) calls `switchProject` before reloading state.

## 5. Electron: replace server respawn with endpoint

- [ ] 5.1 In `electron/src/main.ts`'s `switchProject(picked: string)` function, remove the server-respawn subprocess code path. Replace with `fetch(POST /api/project/switch)` against the live server.
- [ ] 5.2 On success, refresh the BrowserWindow (or send an IPC message to trigger a state refetch).
- [ ] 5.3 Fall through to old behavior only if the endpoint returns non-200 (defensive).
- [ ] 5.4 Update the `--dir <path>` CLI flag handling: still resolves the boot-time PROJECT_ROOT. No behavior change for initial launch.

## 6. VS Code extension parity

- [ ] 6.1 In `vscode-extension/src/extension.ts`, add an activation listener for `vscode.workspace.onDidChangeWorkspaceFolders`. On the first workspace folder update, `fetch` `POST /api/project/switch` with the new folder's absolute path.
- [ ] 6.2 On error, log to the ithyno output channel; don't crash the extension.

## 7. Tests

- [ ] 7.1 `server/project-switch.test.ts` (new): endpoint preflight rejection (400 non-existent, 400 non-directory, 403 unauthorized, 409 concurrent), successful switch updates the module state.
- [ ] 7.2 `server/index.test.ts` — add a test that `getProjectRoot()` reflects `setProjectRoot()` calls across handler contexts.
- [ ] 7.3 Regression: existing PTY tests still pass — cwd is passed explicitly to `attachPtyToSocket`, so no ripple effects.

## 8. Verification

- [ ] 8.1 `npm run openspec -- validate respawn-manager-pty-on-project-switch --strict` passes.
- [ ] 8.2 `npm test` passes.
- [ ] 8.3 `npm run typecheck` passes.
- [ ] 8.4 `npm run build` passes.
- [ ] 8.5 Manual (CLI `npm run dev`): launch from `/path/A` → open dashboard → hit `/api/project/switch` with `/path/B` via devtools or curl → Terminal panel reconnects → run `pwd` in terminal → confirms `/path/B`.
- [ ] 8.6 Manual (Electron): launch → File → Open Project → pick `/path/B` → NO port re-bind flicker, NO subprocess respawn (check `ps` — same PID) → dashboard shows `/path/B` Kanban.
- [ ] 8.7 Manual (VS Code): install the vsix, open a workspace, change the folder → ithyno webview shows new folder's Kanban without a full page reload.
- [ ] 8.8 Manual: `/opsx:propose test-change` in the Manager PTY after switching to `/path/B` → scaffold created at `/path/B/openspec/changes/test-change/`.
- [ ] 8.9 Write `openspec/changes/respawn-manager-pty-on-project-switch/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
