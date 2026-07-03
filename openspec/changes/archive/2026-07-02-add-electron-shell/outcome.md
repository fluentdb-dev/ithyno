# Outcome: add-electron-shell

## ✅ Worked

- **Server spawner is boringly reliable.** Free-port lookup via
  `net.createServer().listen(0)`, spawn `bin/openspec-ui.js` with piped
  stdio, watch stdout for a `token=…` match, then poll `/api/health` on the
  port we already know. A Node smoke script confirmed the whole path end
  to end (spawn → parse → 200 → clean SIGTERM) against
  `examples/sample-project/`.
- **Menu / project-store / window-state split.** The four files
  (`main.ts`, `server-spawner.ts`, `project-store.ts`, `menu.ts`) fell out
  cleanly from the design; `main.ts` ended up being the only file with
  Electron API side effects, and everything else is plain-Node testable.
- **Single-instance semantics collapse into three cases.** Got lock → run;
  didn't get lock → quit; second-instance event → focus existing (or
  switch project if argv carried a folder path). No queueing, no state
  machine.

## ⚠️ Surprises

- **`bin/openspec-ui.js` overrides `PORT` from the env.** Commander's
  `--port <number>` option has a default of `"4321"` and there's no
  "was-set-explicitly?" check, so setting `env.PORT` in the spawn call
  didn't matter — the CLI wrote its own default back into the child env.
  Fix: pass `--port <freeport>`, `--dir <projectRoot>`, and `--no-open`
  as real CLI args from the spawner. Also had to `delete env.OPENSPEC_DEV`
  so a developer with `OPENSPEC_DEV=1` in their shell doesn't get the Vite
  URL (5173) printed and confuse the token parser.
- **Token-URL parsing was over-specified.** The design says "regex
  `http://localhost:\d+/\?token=[a-f0-9]+`", but the server prints
  different URLs depending on DEV vs prod (in DEV, both the API URL
  *without* a token and the Vite URL *with* a token appear on the same
  line). Simpler and more robust: parse just `token=([a-f0-9]+)` and
  construct the URL ourselves from the port we picked. Recorded in the
  spawner comments; the design still describes intent correctly.
- **Native `node-pty` prebuild failed on Python 3.13.** The `distutils`
  module was removed in Py3.13 and the local node-gyp still imports it,
  so `npm install` blew up on the (unrelated) `@homebridge/node-pty-…`
  build step. `npm install --ignore-scripts` unblocked the workspace and
  the server gracefully degrades to `terminal.available: false` at
  runtime — enough to exercise everything except the embedded PTY.

## 🔁 Differently

- **Packaged-app end-to-end left as follow-up.** `bin/openspec-ui.js`
  currently spawns `node_modules/.bin/tsx` to run TypeScript directly.
  That's fine for `npm run electron:dev` in the worktree, but a shipped
  DMG/NSIS/AppImage won't have `tsx` on disk under
  `Contents/Resources/app/`. Two clean paths (documented in
  `electron/README.md → Known packaging gap`):
  1. Run `npm run build:server` and teach the bin to prefer `server-dist/`
     when it exists — the smaller, saner option.
  2. Ship `node_modules/` in `extraResources` — bloated, avoid.
  Either way, task 10.7 (packaged-artifact verification) needs that gap
  closed. The `electron-builder` config exists and is correct; the
  artifact just isn't self-contained yet.
- **§10 verification is manual-only in this environment.** Tasks 10.1–10.6
  are Finder/dock/keyboard interactions; no headless surrogate. Left
  unchecked in `tasks.md` with a footnote pointing at the smoke-scripted
  spawner path (which covers the interesting failure modes: bad port,
  hung startup, missing project root, SIGTERM cleanliness).

  Post-merge follow-up (2026-07-03): 10.1–10.5 were manually re-verified
  against main via `npm run electron:dev` and pass. 10.6 exposed a real
  bug — the `second-instance` handler was resolving argv's `.` against
  the first-instance's process CWD instead of the second instance's
  `workingDirectory`, and `ProjectStore.setProject` accepted relative
  paths. Both fixed in a follow-up commit (`electron: normalize project
  paths on second-instance + store`). The dev-mode artifact where the
  second `npm run electron:dev` corrupts state remains — a shipped
  packaged app's argv doesn't include a stray `.`, so it doesn't
  reproduce there. Full 10.6 pass therefore stays deferred to the
  packaged verify (10.7).

## 🌱 Follow-ups

- **`add-electron-packaging-self-contained`.** Fix the tsx dependency so
  the DMG actually runs standalone; probably ships `server-dist/` and
  updates `bin/openspec-ui.js` to prefer compiled JS.
- **`add-electron-code-signing`.** Apple Developer ID + notarization on
  macOS, EV cert on Windows. Requires paid credentials; strictly out of
  scope for v1 (unsigned Gatekeeper/SmartScreen bypass is documented).
- **`add-electron-auto-update`.** `electron-updater` against a static
  release feed. Design punted this deliberately; wait until we have a
  real release cadence.
- **Teach `bin/openspec-ui.js` to distinguish default vs explicit
  `--port`.** Would let shells set `PORT` in env instead of duplicating
  the value on the argv. Low priority — one-liner in commander:
  `program.getOptionValueSource('port') === 'default' ? env.PORT : opts.port`.
