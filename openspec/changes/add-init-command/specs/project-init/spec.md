## ADDED Requirements

### Requirement: openspec-ui init Subcommand
The system SHALL provide an `init` subcommand on the `openspec-ui` CLI that
scaffolds a target project with every file the dashboard expects, and SHALL
preserve the existing zero-argument behavior (start the server) unchanged.

#### Scenario: Default invocation scaffolds current directory
- **WHEN** the user runs `openspec-ui init` with no arguments
- **THEN** the command scaffolds the current working directory

#### Scenario: Explicit target directory
- **WHEN** the user runs `openspec-ui init ./some/path`
- **THEN** the command scaffolds that path

#### Scenario: No subcommand starts the server
- **WHEN** the user runs `openspec-ui` with no subcommand
- **THEN** the server starts as before

### Requirement: Idempotent Scaffold
The system SHALL skip files that already exist at the target by default and
SHALL overwrite them only when `--force` is provided, so re-running init never
silently destroys user edits.

#### Scenario: Skip existing files
- **WHEN** `openspec-ui init` runs against a directory whose `CLAUDE.md` exists
- **THEN** the command reports `skip: CLAUDE.md` and does not modify it

#### Scenario: Force overwrites
- **WHEN** the user runs `openspec-ui init --force` and a target file exists
- **THEN** the command reports `overwrite: <path>` and replaces the file with the template content

#### Scenario: Empty directories are created with .gitkeep
- **WHEN** the target lacks `docs/` and `docs/ideas/`
- **THEN** the command creates the directories with `.gitkeep` so they survive `git add`

### Requirement: Preflight Checks
The system SHALL verify prerequisites before scaffolding and SHALL produce
actionable messages when something is missing.

#### Scenario: Target is not a git repo
- **WHEN** the target directory does not contain a git repository
- **THEN** the command exits non-zero with a message explaining that OpenSpec UI's agent runner requires git

#### Scenario: openspec/ is missing
- **WHEN** the target directory lacks `openspec/config.yaml`
- **THEN** the command warns the user and prints the exact `openspec init` command to run, but proceeds with the scaffold (the dashboard works without `/opsx:*` commands installed)

### Requirement: Bundled Templates
The system SHALL keep the scaffold templates inside this package under a
`templates/` directory so they evolve alongside the code and version with
each release.

#### Scenario: Templates resolved relative to package root
- **WHEN** the init handler reads its templates
- **THEN** it resolves the path from the package's own location, not from the user's working directory

#### Scenario: Generic CLAUDE.md template
- **WHEN** the CLAUDE.md template is copied
- **THEN** it contains generic placeholders for project-specific commands (no `npm test`-style references that would mislead non-Node projects)

### Requirement: .gitignore Maintenance
The system SHALL ensure `.worktrees/` appears in the target project's
`.gitignore`, creating the file if necessary and otherwise appending only when
the line is missing.

#### Scenario: Append to existing .gitignore
- **WHEN** `.gitignore` exists and does not contain `.worktrees/`
- **THEN** the command appends `.worktrees/` to the file (preserving prior content)

#### Scenario: Already present
- **WHEN** `.gitignore` already contains `.worktrees/`
- **THEN** the command leaves it untouched

#### Scenario: Opt out
- **WHEN** the user passes `--no-gitignore`
- **THEN** the command does not modify or create `.gitignore`

### Requirement: Next-step Summary
The system SHALL print a summary of created / skipped files and a list of
next-step commands the user should run, so the path from "ran init" to
"opened the dashboard" is one paragraph long.

#### Scenario: Summary output
- **WHEN** `openspec-ui init` finishes
- **THEN** the command prints the count of created and skipped files, whether `.gitignore` was updated, and the commands to install OpenSpec (if missing) and start the dashboard
