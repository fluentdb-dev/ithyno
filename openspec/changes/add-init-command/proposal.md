---
tags: [feature/migration, feature/cli, area/server]
---

## Why

Onboarding an existing project to OpenSpec UI today is a multi-step manual
process — copy `CLAUDE.md`, copy the openspec-flow skill, copy
`agents.yaml.example`, edit `.gitignore`, create `docs/` (see
[migration-guide](../../../docs/migration-guide.md)). Each step is small but
together they discourage adoption and leave room for inconsistency across
projects.

This change replaces all of that with **`openspec-ui init [dir]`** — a single
idempotent subcommand that scaffolds every project-side file the dashboard
expects, with skip-if-exists by default and `--force` to overwrite. It is the
"sane defaults" wrapper around the migration guide.

## What Changes

The `bin/openspec-ui.js` CLI gains an `init` subcommand:

```bash
openspec-ui init                  # scaffold the current directory
openspec-ui init ./other          # scaffold a specific directory
openspec-ui init --force          # overwrite existing files
openspec-ui init --no-gitignore   # skip the .gitignore edit
```

The command:

1. **Preflight**: confirms the target is a git repo and warns when
   `openspec/` is missing (with the exact `openspec init` command to run).
2. **Scaffolds files from bundled templates**:
   - `CLAUDE.md` (generic version — no `npm test` references)
   - `.claude/skills/openspec-flow/SKILL.md` (verbatim copy of the skill in
     this repo)
   - `agents.yaml.example` (verbatim copy of this repo's file)
   - `docs/` and `docs/ideas/` directories (empty, with a small `.gitkeep`)
3. **Appends to `.gitignore`**: adds `.worktrees/` only if not present.
4. **Reports**: lists each file as created / skipped, and prints the
   next-step commands to start the dashboard.

The existing default behavior of `openspec-ui` (starting the server) is
unchanged when no subcommand is given.

## Capabilities

### New Capabilities
- `project-init`: a CLI subcommand that scaffolds the per-project files
  OpenSpec UI expects, idempotently

### Modified Capabilities
<!-- none -->

## Impact

- `bin/openspec-ui.js`: parse subcommands via `commander`; dispatch to the
  default server start or the new init handler
- New `bin/init.js` (or `server/init.ts`) holding the scaffold logic
- New `templates/` directory at the package root holding the files that get
  copied
- README updated to document the command
- `docs/migration-guide.md` updated to feature `openspec-ui init` as the
  primary path with the manual steps as fallback
- No new dependencies; reads/writes via Node's `fs/promises`
