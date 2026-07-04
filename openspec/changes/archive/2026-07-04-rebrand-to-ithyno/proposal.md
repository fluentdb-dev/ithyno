---
tags: [feature/branding, area/server, area/web, area/electron, area/vscode, area/build]
---

## Why

The project began as "OpenSpec UI" — a dashboard for the OpenSpec
workflow. Over time it accumulated its own opinionated extensions
(the `/ithy-opsx:` skill namespace, the agent runner, the writeback
UX, the Electron / VS Code channels) and the "OpenSpec UI" name
started to muddle two things:

1. **The workflow**: OpenSpec (upstream `@fission-ai/openspec`, the
   `openspec/` directory convention, `openspec archive` etc.)
2. **The app**: this repo, which reads / writes to the OpenSpec
   directory layout and adds a lot of its own capabilities on top.

The clearer split is: **ithyno = the app**, **OpenSpec = the workflow
it operates on**. `/ithy-opsx:` was our first attempt at that
namespace; this change completes it.

The repo has not been released or published, so we can do the
full rename without breaking any external consumers.

## What Changes

### Scope: rename everything user- and code-visible

Because there is no external release, we take the aggressive path and
rename **display, package, binary, workspace, and env-var** layers in
one commit. Only OpenSpec-workflow terms (upstream CLI, `openspec/`
directory, `.claude/skills/openspec-*` skills, `opsx:*` slash
commands) stay unchanged — those belong to the workflow, not this
app.

### 1. Package names

- Root `package.json`: `"name": "openspec-ui"` → `"name": "ithyno"`
- Electron workspace: `openspec-ui-electron` → `ithyno-electron`
- VS Code extension: `openspec-ui-vscode` → `ithyno-vscode`
  (extension `displayName` also becomes `"ithyno"`)
- Description strings and README pointers update to match.

### 2. Binary rename

- `bin/openspec-ui.js` → `bin/ithyno.js` (git-mv preserves history).
- Root `package.json` `bin` field: `"ithyno": "bin/ithyno.js"`
- CLI's own help text and startup banner say "ithyno".

### 3. Env vars

Every `OPENSPEC_UI_*` (or `OPENSPEC_*` used by our code, not
upstream) is renamed:

- `OPENSPEC_UI_SHELL` → `ITHYNO_SHELL`
- `OPENSPEC_UI_TERMINAL_STARTUP` → `ITHYNO_TERMINAL_STARTUP`
- `OPENSPEC_UI_PORT` → `ITHYNO_PORT`
- `OPENSPEC_PROJECT_ROOT` → `ITHYNO_PROJECT_ROOT`
- `OPENSPEC_OPEN` → `ITHYNO_OPEN`
- `OPENSPEC_DEV` → `ITHYNO_DEV`

**Kept as-is** (they refer to the upstream OpenSpec CLI / workflow):
`openspec/` directory name, `.claude/skills/openspec-*/`,
`.claude/commands/opsx/*.md`, `npx openspec archive`, etc.

### 4. Display strings

- Server startup: `✔  ithyno on http://localhost:PORT/?token=…`
  (was "OpenSpec UI on …")
- Electron window `title: "ithyno"` (was "OpenSpec UI")
- macOS App menu name "ithyno"
- Root `README.md` heading: `# ithyno` with a lead sentence that
  says "a local dashboard for the OpenSpec workflow"
- HTML `<title>` in `web/index.html`
- Toast / error messages that say "OpenSpec UI: …" become "ithyno:
  …"

### 5. `agents.yaml` and command names

- Embedded terminal auto-launch env / config keys become
  `ITHYNO_*`
- Example `agents.yaml` comments refer to the app as "ithyno" and
  the workflow as "OpenSpec"

### 6. Documentation

- `README.md` — global rename of app references; keep OpenSpec
  workflow references
- `docs/*.md` — same treatment; call out the split explicitly in
  one paragraph so future readers know why some places still say
  "OpenSpec"
- `CLAUDE.md` — update project rules that reference the app name
- `.claude/skills/openspec-flow/SKILL.md` — if it references
  "OpenSpec UI" as the app, update to "ithyno"; do NOT touch
  workflow terms

## Capabilities

### Modified Capabilities

- `dashboard`: user-visible name, startup banner, window title, HTML
  title, and toast prefixes rebrand to "ithyno"; `ITHYNO_*` env vars
  supersede the previous `OPENSPEC_*` / `OPENSPEC_UI_*` set
- `electron-shell`: app name, window title, and package identifier
  become ithyno-flavored
- `vscode-extension`: extension display name and package identifier
  become ithyno-flavored

## Impact

- `package.json` (root + `electron/`, `vscode-extension/`)
- `package-lock.json` regen after the rename
- `bin/openspec-ui.js` → `bin/ithyno.js` (git mv)
- `server/index.ts` — env var reads + startup banner
- `electron/src/main.ts`, `electron/package.json`
- `vscode-extension/package.json`, `vscode-extension/src/extension.ts`
- `web/index.html` — `<title>`
- `web/src/*` — occasional toast prefixes and app-name strings
- `README.md`, `docs/**/*.md`, `CLAUDE.md`
- `agents.yaml.example` (comments only; agent definitions
  unchanged)

## Out of scope

- **Directory rename of `openspec-ui/` on disk.** That's a user
  action (they clone into whatever dir they want). No git history
  change.
- **Renaming the OpenSpec workflow's own artifacts** (`openspec/`
  dir, `openspec archive` CLI, `openspec-flow` skill). Those are
  upstream identity.
- **Migrating existing users' `agents.yaml`**: since none exist
  outside this repo yet, no shim needed.
- **Publishing to npm**. Rename lands here; publishing is a
  separate follow-up when we're ready to distribute.
- **Backward-compat aliases for the old env vars.** Not needed —
  no external consumers.
