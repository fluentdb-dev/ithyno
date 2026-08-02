# Outcome: respawn-manager-pty-on-project-switch

## ✅ Worked

- `PROJECT_ROOT` promoted from `const` to `let currentProjectRoot`
  behind `getProjectRoot()` getter and `setProjectRoot(next)` mutator
  in `server/index.ts`. Every in-file reader converted via a single
  `Edit replace_all`.
- New `POST /api/project/switch` endpoint: preflight (missing / non-string
  / non-absolute / non-existent / non-directory → 400, unauthorized system
  path → 403, concurrent → 409), then `terminateAllLivePtys()` → `setProjectRoot()`
  → broadcast `state-replaced` → 200.
- `terminateAllLivePtys()` helper added to `server/sync/pty.ts`. Snapshots
  `live[]` before iterating so per-entry `ws.on("close")` splices don't
  skip entries.
- `/pty` WS handler now reads `getProjectRoot()` dynamically — a
  reconnect after switch attaches to a PTY spawned in the new cwd.
- New `server/project-switch.test.ts` covers all preflight branches +
  concurrency guard shape.
- `terminateAllLivePtys` gets a no-op smoke test in `server/sync/pty.test.ts`.
- All gates green: `openspec validate --strict`, `npm test` (49 files
  / 641 tests), `npm run typecheck`, `npm run build`.

## ⚠️ Surprises

- The `Edit replace_all` for `PROJECT_ROOT` → `getProjectRoot()` also
  matched inside the env-var name `ITHYNO_PROJECT_ROOT`, turning it
  into `ITHYNO_getProjectRoot()`. Caught by grep and manually reverted.
- `os.tmpdir()` on macOS returns `/var/folders/…` which trips the
  `/var` blocklist in `isAuthorizedImportPath`. The test file uses
  `homedir()` as its base instead.
- Boot-time constructors (`agentRegistry`, `agentRunner`, `DOCS_DIR`,
  `ProjectRootWatcher`) still capture `getProjectRoot()`'s value at
  construction time — they don't re-initialize on switch. This is a
  known limitation, deferred to follow-up.

## 🔁 Differently

- An earlier subagent-authored implementation (29/32 tasks, spanning
  server + electron + vscode + a `server/project-switch.ts` module)
  was discarded per user pushback ("そんなに難しい実装ですか？"). The
  proposal / tasks / spec were narrowed to server-core only, and the
  minimal implementation landed at roughly one-tenth the surface area.
- Reused the existing `isAuthorizedImportPath` inside `server/index.ts`'s
  `setupImportRoutes` closure rather than extracting it to a shared
  module. That preserves the current file layout and avoids a new
  server-side module that would need its own tests + docs.

## 🌱 Follow-ups

- **Electron `switchProject()` rewrite**: drop the server subprocess
  respawn in favor of `fetch(POST /api/project/switch)` against the
  live server. Removes the port re-bind flicker on Open Project.
- **VS Code `onDidChangeWorkspaceFolders` listener**: forward the new
  workspace root to the endpoint so the ithyno webview follows the
  editor's workspace.
- **Dashboard UI trigger**: a small "Open Project" affordance that
  calls `switchProject()` from the web client — currently the endpoint
  is only invocable via devtools / curl.
- **Live-reload of boot-time constructors**: `agentRegistry`,
  `agentRunner`, `DOCS_DIR`, and `ProjectRootWatcher` still hold the
  original project root at construction. A future change can decide
  whether to re-instantiate on switch or accept the current behavior
  (only PTY cwd + `getProjectRoot()`-based handlers pick up the new
  root).
