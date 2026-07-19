# Outcome — add-init-http-endpoint

## ✅ Worked

- **`runInit` extension is fully backward-compatible.** `autoCreateDir`
  and `autoGitInit` default to `false`; existing CLI callers see zero
  behavior change. Manual verify of `npx ithyno init /existing/repo`
  still fails on missing dir / non-git dir with the old error text.
- **`POST /api/init`** authenticates via the same 2-layer stack every
  other mutating endpoint uses (global CSRF token + per-endpoint
  `isLocal`). Manual curl (with `x-session-token` header) round-tripped
  successfully: 200 on happy path, 400 on relative-dir rejection.
- **Browser UI** deliberately minimal — parent path + name + 2 option
  toggles + result panel. Matches the existing Settings section shape
  (agmsg editor next door). No new CSS beyond reusing
  `.settings-section`, `.settings-field`, `.settings-toggle`.
- **Tests grew from 269 to 274** — 5 new tests covering both new option
  flags in all four combinations. All 274 pass.

## ⚠️ Surprises

- **The spec text initially said "CSRF-token middleware" for auth**, but
  the actual pattern is a 2-layer stack (global CSRF check + per-endpoint
  `isLocal`). Corrected the delta to mention `isLocal` specifically,
  matching how `/api/git/init` and `/api/config/agmsg` describe their
  guards. The global CSRF layer is implicit in the spec (same for every
  mutating endpoint) and not repeated per requirement.
- **Header name is `x-session-token`**, not the `x-csrf-token` I first
  guessed when writing the manual verify script. Minor and only affects
  the docs / any external testing harness.

## 🔁 Differently next time

- **Cross-check auth pattern before writing spec.** I could have grep'd
  for `checkAuthHttp` and the existing endpoints' auth error strings
  before writing the initial scenario descriptions. Would have saved a
  post-impl spec correction.
- **`runInit` file layout**: the endpoint imports `../bin/init.js` from
  `server/index.ts` via dynamic `import()`. Static import at file top
  would be cleaner but conflicts slightly with the pre-existing "load
  init lazily" pattern (init isn't needed on every server startup).
  Kept dynamic; documented in the endpoint comment.

## 🌱 Follow-ups

- **`add-electron-new-project-flow`**: Electron main-process handler
  that opens `showOpenDialog({ properties: ['openDirectory',
  'createDirectory'] })`, prompts for a project name, imports `runInit`
  directly (agmsg-installer pattern), and calls `open-project` IPC
  after success. Does not use this HTTP endpoint.
- **`add-vscode-new-project-command`**: extension command that uses
  `vscode.window.showOpenDialog` + `showInputBox` and imports `runInit`
  from the extension host process. Also does not use this HTTP
  endpoint.
- **`.claude-plugin/plugin.json` for Ithyno**: separate track from the
  init flow — would let users `/plugin marketplace add
  fluentdb-dev/ithyno` from Claude Code. Not tied to init but part of
  the broader install-procedure conversation.
- **Optional**: `openspec init` auto-chain from the New Project UI
  (currently the response's "Next steps" panel shows the exact command
  but doesn't run it). Deferred until the CLI flow surfaces friction.
