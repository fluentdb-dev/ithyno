---
tags: [feature/init, feature/cli, area/server, area/ui]
---

# Init from UI — HTTP endpoint + `runInit` autoCreateDir/autoGitInit

## Why

`add-init-command` (2026-07-19 archived) landed the `ithyno init [dir]` CLI.
It works well from a terminal, but Ithyno's other distribution channels
(Electron, browser dashboard, VS Code extension) currently have no
programmatic way to reach the same scaffold. The idea doc at
`docs/ideas/2026-07-19-init-from-ui.md` proposes exposing `runInit` as an
HTTP endpoint so a "New Project" button in any UI channel can drive the
same code path.

This change lands the **backbone**: the endpoint plus the two option
extensions that a New-Project button needs (`autoCreateDir`, `autoGitInit`).
Electron IPC bridge and VS Code extension command are separate follow-up
proposes (they consume this endpoint / function).

Without this endpoint, downstream Electron and VS Code work would each
have to reinvent the preflight-and-scaffold sequence, and the CLI's
"assume the user prepared the git repo" contract does not fit a
one-click "create new project" flow.

## What Changes

### 1. `runInit` gains two option flags

```ts
runInit({
  targetDir,
  force = false,
  skipGitignore = false,
  quiet = false,
  autoCreateDir = false,   // NEW
  autoGitInit = false,     // NEW
  log = console.log,
});
```

- `autoCreateDir: true` — when the target directory does not exist,
  `mkdir -p` it, then continue with preflight. `false` (default) keeps
  the current CLI behavior of failing with `Target directory does not
  exist`.
- `autoGitInit: true` — when the preflight finds the target is not a git
  repo, `git init` inside it, then re-check. `false` (default) keeps the
  current CLI behavior of failing with `not a git repository`.

Both defaults are `false` — the existing CLI invocation is byte-for-byte
unchanged. The RunInitResult return value gains one new field:

```ts
{
  ...existing,
  gitInitPerformed?: boolean;   // true only when autoGitInit ran `git init`
}
```

### 2. `POST /api/init` HTTP endpoint

Registered on the Ithyno server (`server/index.ts` or a dedicated route
file). Body:

```json
{
  "dir": "/absolute/path",
  "force": false,
  "skipGitignore": false,
  "autoCreateDir": true,
  "autoGitInit": true
}
```

Response on success:

```json
{
  "ok": true,
  "target": "/absolute/path",
  "actions": [{ "path": "CLAUDE.md", "action": "create" }],
  "gitignoreResult": "created",
  "summary": { "created": 6, "overwritten": 0, "skipped": 0 },
  "openspecMissing": true,
  "gitInitPerformed": true
}
```

Response on failure: HTTP 4xx/5xx with `{ ok: false, exitCode, reason }`
(exit codes mirror the CLI: 2 for preflight failure).

Auth: gated behind the existing CSRF-token middleware — same posture as
the phase API and the `agmsg` config endpoint. Non-auth callers receive
`{ error: "auth required" }`.

Path validation: `dir` MUST be an absolute path. Relative paths are
rejected with 400 — the server MUST NOT resolve relative to its own cwd
because that's ambiguous across channels.

### 3. Browser dashboard: minimal "New Project" form

Added to the Settings tab (`web/src/pages/Settings.tsx`) as a new
section beneath the existing agmsg block editor. Fields:

- **Parent directory** (text input, absolute path expected)
- **Project name** (text input, kebab-case suggested)
- Options as checkboxes: `Overwrite existing files` (`force`),
  `Skip .gitignore` (`skipGitignore`)
- Two hidden defaults for browser mode: `autoCreateDir: true`,
  `autoGitInit: true`
- Submit button → hits `POST /api/init` with
  `dir = parent + "/" + name`

The dashboard displays the action list from the response as a scrollable
log. On success, a "Next steps" panel shows the exact `openspec init`
command to run (from `openspecMissing: true`) and a note about launching
Ithyno against the new path.

The browser cannot reliably open a native directory picker (Chrome-only
`showDirectoryPicker()` is an ADAP-flagged experimental API). This is
acceptable for the backbone propose — Electron's follow-up change adds
the native dialog. Browser users type the absolute path or paste from
the Finder / Explorer path bar.

### 4. What this change does NOT touch

- **Electron main-process IPC** for a native folder picker — separate
  `add-electron-new-project-flow` propose.
- **VS Code extension command** — separate `add-vscode-new-project-command`
  propose that imports `runInit` directly.
- **Auto-chaining `openspec init`** after `ithyno init` — the idea doc
  raises this as an open question; deferred until a real "new project"
  UX shows whether the extra 10-second npx download is worth the
  auto-chain.
- **Progress streaming** — init is fast enough that a synchronous
  response is acceptable. If Electron or VS Code want streamed logs
  later, the endpoint can be reshaped without changing the contract.
- **CLI-side flags** — `--auto-create-dir` / `--auto-git-init` are NOT
  added to the CLI. The idea doc raises this as an open question; the
  New-Project UX is UI-driven, so the CLI stays a terminal-user tool
  with its current preflight-strict behavior.

## Spec deltas (`project-init` capability)

- **MODIFIED** `Preflight Checks` — describe how `autoCreateDir` /
  `autoGitInit` change the failure paths into recovery paths.
- **ADDED** `Init HTTP Endpoint` — new requirement covering the
  `POST /api/init` shape, auth, path validation, and channel purpose.

## Impact

- **Affected specs**: `project-init` — 1 MODIFIED, 1 ADDED
- **Affected code**:
  - `bin/init.js`: add the two options and the new return field
  - `bin/init.d.ts`: extend the type declarations
  - `server/init.test.ts`: cover autoCreateDir + autoGitInit branches
  - `server/routes/init.ts` (new): the HTTP handler
  - `server/index.ts`: register the route
  - `web/src/api.ts`: add `initProject()` client
  - `web/src/pages/Settings.tsx`: `NewProjectSection` component
- **Risk**:
  - Existing CLI callers: default-false flags keep behavior identical.
    The added return field is optional — no consumer will break.
  - Malicious path: absolute-path requirement plus CSRF gating limit
    the endpoint to the local user session, matching Ithyno's
    single-tenant model.
  - `autoGitInit` runs `git init` in a directory the caller chose. If
    the caller pointed at an already-populated directory that ISN'T a
    git repo (e.g. `/tmp`), we'd inject a `.git/` into it. Path
    validation mitigates the worst outcomes, but a `--dry-run` option
    for the endpoint would be a reasonable follow-up.
- **Migration**: none.

## Related

- `docs/ideas/2026-07-19-init-from-ui.md` — the design conversation
  behind this split.
- `openspec/changes/archive/2026-07-19-add-init-command/` — landed the
  CLI init and `runInit`.
- Planned follow-ups: `add-electron-new-project-flow`,
  `add-vscode-new-project-command`.
