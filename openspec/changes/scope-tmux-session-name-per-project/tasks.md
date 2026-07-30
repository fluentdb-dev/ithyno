# Tasks

## 1. Per-project tmux session name

- [x] 1.1 In `server/sync/pty.ts`, replace the default `"ithyno"` at the `const session = process.env.ITHYNO_TMUX_SESSION || "ithyno"` site with a per-project derivation: `ithyno-<hash>` where `<hash>` = `createHash("sha256").update(projectRoot).digest("hex").slice(0, 12)`. Reuse `node:crypto`.
- [x] 1.2 The hash SHALL derive from the resolved (post-realpath) project root — the same one already threaded to `ptyStartup(registry, projectRoot)`. When `projectRoot` is unavailable (older callers, tests), fall back to the literal `"ithyno"` to preserve current behavior.
- [x] 1.3 `ITHYNO_TMUX_SESSION` env var precedence: unchanged — when set to a non-empty string, its literal value wins over the per-project default.

## 2. `terminateAllLivePtys` companion cleanup

- [x] 2.1 In `server/sync/pty.ts`, extend `terminateAllLivePtys()` to also invoke `tmux kill-session -t <session-name>` for the previous project's session. Compute the session name via the same derivation. Best-effort: swallow errors (session not found, tmux missing, etc.), log a debug line.
- [x] 2.2 The old session name must be captured BEFORE `setProjectRoot()` updates the root — otherwise the kill targets the NEW session. Order matters: `POST /api/project/switch` handler computes `oldRoot` first, then calls the extended terminate, then `setProjectRoot`.

## 3. Tests

- [x] 3.1 `server/sync/pty.test.ts`: unit test the new session-name derivation — two distinct project roots produce two distinct names; same root produces the same name; env var overrides win; empty projectRoot → literal `"ithyno"`.
- [x] 3.2 `server/project-switch.test.ts`: extend with an expectation that the old session name is captured pre-`setProjectRoot`, so subsequent `terminateAllLivePtys` invokes `tmux kill-session -t <oldName>`.

## 4. Verification

- [x] 4.1 `npm run openspec -- validate scope-tmux-session-name-per-project --strict` passes.
- [x] 4.2 `npm test` passes (pre-existing `build-icons` sharp failure OK).
- [x] 4.3 `npm run typecheck` passes.
- [x] 4.4 `npm run build` passes.
- [ ] 4.5 Manual: `tmux kill-server` to clean any leftover global `ithyno` session. Launch ithyno at `openspec-ui` (agmsg enabled) → `tmux ls` shows `ithyno-<hashOpenspecUi>`. Kill ithyno, launch at `test-proj` → `tmux ls` shows `ithyno-<hashTestProj>` (new, no collision).
- [ ] 4.6 Manual: launch ithyno at A, `POST /api/project/switch` to B, `tmux ls` shows only `ithyno-<hashB>` (A's session was killed as part of the switch).
- [x] 4.7 Write `openspec/changes/scope-tmux-session-name-per-project/outcome.md` — include the one-time user migration note (`tmux kill-session -t ithyno` for anyone with a leftover global session on upgrade).
