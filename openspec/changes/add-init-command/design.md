## Context

`docs/migration-guide.md` describes the manual steps to bring an existing
project under OpenSpec UI management. The steps are simple in isolation but
together they require copying several files from this package's source tree
into the target project — which assumes the user knows where this package
lives on disk, gets the file paths right, and remembers to edit `.gitignore`.

A bundled `init` subcommand fixes all of that with one command per project.
It also gives us a single place to evolve the project-side conventions: if we
add `outcome.md.template` or a new skill later, `openspec-ui init --force`
becomes the documented upgrade path.

## Goals / Non-Goals

**Goals:**
- One-command scaffold of every file the dashboard expects on the project
  side.
- Idempotent by default (skip files that already exist), with `--force` to
  overwrite.
- Clear preflight messages that explain what to fix when prerequisites are
  missing.
- Templates live inside the package so they evolve with the code.

**Non-Goals:**
- Running `npx openspec init` automatically. We **report** that step but do
  not perform it — the official CLI's prompts and Claude Code wiring are its
  job. Auto-running it would couple our release cycle to theirs.
- Migrating existing artifacts (READMEs, ADRs, issues) into the OpenSpec
  layout. That's a per-project human judgment call covered in the migration
  guide.
- Detecting prior `openspec-ui init` runs to offer "upgrade" semantics.
  v1 treats each file independently — skip or overwrite.
- npm publishing. Until that lands, `init` works via the same local-install
  paths the migration guide already documents.

## Decisions

### Subcommand dispatch

`bin/openspec-ui.js` switches on the first non-flag argument:

```
openspec-ui                  → start server (existing behavior)
openspec-ui init [dir]       → scaffold
openspec-ui --help / -h      → top-level help including init
openspec-ui init --help      → init-specific help
```

Implementation via `commander` (already a dep). The default action remains
the server start so nothing breaks.

### Template layout

```
templates/
├── CLAUDE.md                                    # generic project rules
├── .claude/skills/openspec-flow/SKILL.md        # the skill, verbatim
├── agents.yaml.example                          # verbatim
└── docs/
    ├── .gitkeep
    └── ideas/.gitkeep
```

Templates ship inside the package. The init handler reads each file with
`fs.readFile`, then writes to the resolved target path. No template
substitution in v1 — the files are copied verbatim. (If we later want to
substitute the project name into `CLAUDE.md`, we'd add a tiny `${var}`
replacement, same shape as `agents.yaml` template vars.)

### Generic `CLAUDE.md`

This repo's own `CLAUDE.md` references commands specific to OpenSpec UI
(`npm test`, `npm run build`, etc.). The template version drops those and
leaves a placeholder line: `# Replace with your project's verification
commands`. This is the smallest divergence that still results in a usable
file for any target.

### Preflight checks

The handler runs:

1. `git rev-parse --git-dir` in the target directory. Failure → exit 2 with a
   message that the project must be a git repo.
2. Check for `openspec/config.yaml`. Missing → print the exact
   `openspec init` command but do NOT exit; the dashboard still works
   without the official CLI's slash commands.

### File scaffold policy

For each template file, resolve target path, then:

- If target file exists and `--force` is not set → log "skip: <path>" and
  continue.
- If target file does not exist → ensure parent dir, write file, log
  "create: <path>".
- If target file exists and `--force` is set → write file, log
  "overwrite: <path>".

Empty directories (`docs/`, `docs/ideas/`) are created via a one-byte
`.gitkeep` so they survive a `git add`.

### `.gitignore` handling

Read the existing `.gitignore` if any. If the literal line `.worktrees/`
does not appear, append it (preserving the prior content and adding a
trailing newline if needed). If the file doesn't exist, create it with that
single line. `--no-gitignore` skips this step entirely.

### Output

Plain text, one line per action. Final block summarizes:

```
Created 4 files. Skipped 1. Updated .gitignore.

Next steps:
  npx -y -p @fission-ai/openspec@latest openspec init . --tools claude   # if openspec/ is missing
  openspec-ui                                                            # start the dashboard
```

`--quiet` reduces output to errors only.

## Risks / Trade-offs

- **Template drift.** If the in-repo skill or `CLAUDE.md` evolves, the
  templates can fall behind. Mitigation: a tiny test asserts that
  `templates/.claude/skills/openspec-flow/SKILL.md` and the in-repo skill
  are byte-identical (or differ only by an explicitly marked block).
- **Force overwrites user edits.** The `--force` flag is opt-in and the
  output makes it obvious what got overwritten. We trust the user.
- **Path resolution.** When openspec-ui runs from the local source (not a
  global install), the package root has to be resolved correctly. Standard
  `import.meta.url` pattern; tested on the existing `bin/openspec-ui.js`.
- **No `git init`.** We refuse to auto-`git init` because that changes the
  project's nature. The preflight error is clear.
