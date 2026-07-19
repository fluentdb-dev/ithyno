# project-init Specification

## Purpose
TBD - created by archiving change add-init-command. Update Purpose after archive.
## Requirements
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
actionable messages when something is missing. The preflight SHALL also
support two opt-in recovery flags that turn "hard failures" into
"do the thing and continue":

- `autoCreateDir` — when the target directory does not exist, create it
  (`mkdir -p`) before running preflight. Default `false`.
- `autoGitInit` — when the target directory is not a git repo, run
  `git init` inside it before checking git prerequisites. Default `false`.

Both flags exist for programmatic callers (the HTTP endpoint, VS Code
extension host) that want a one-shot "new project" flow. The CLI keeps
both defaults at `false` so terminal users retain the current strict
preflight (fail on missing dir or non-git dir with a clear message).

The RunInitResult return value SHALL include a `gitInitPerformed:
boolean` field that is `true` when `autoGitInit` caused `git init` to
run and `false` (or omitted) otherwise.

#### Scenario: Target is not a git repo
- **WHEN** the target directory does not contain a git repository
- **AND** `autoGitInit` is `false`
- **THEN** the command exits non-zero with a message explaining that ithyno's agent runner requires git

#### Scenario: openspec/ is missing
- **WHEN** the target directory lacks `openspec/config.yaml`
- **THEN** the command warns the user and prints the exact `openspec init` command to run, but proceeds with the scaffold (the dashboard works without `/opsx:*` commands installed)

#### Scenario: autoCreateDir creates the target directory recursively
- **GIVEN** a caller invokes runInit with `targetDir: "/tmp/new/nested/project"` where none of the parents exist
- **AND** `autoCreateDir: true`
- **WHEN** the preflight runs
- **THEN** the missing parents and target are created via `mkdir -p` before the git-repo check runs

#### Scenario: autoCreateDir off keeps the current failure
- **GIVEN** the target directory does not exist
- **AND** `autoCreateDir` is `false` (default)
- **WHEN** the preflight runs
- **THEN** the command exits with `Target directory does not exist: <path>` and no filesystem changes are made

#### Scenario: autoGitInit runs `git init` and continues
- **GIVEN** the target directory exists but is not a git repository
- **AND** `autoGitInit: true`
- **WHEN** the preflight runs
- **THEN** `git init` runs inside the target, preflight re-checks and passes, the scaffold proceeds, and the result includes `gitInitPerformed: true`

#### Scenario: autoGitInit off keeps the current failure
- **GIVEN** the target is not a git repo
- **AND** `autoGitInit` is `false` (default)
- **WHEN** the preflight runs
- **THEN** the command exits with the existing "not a git repository" message and `gitInitPerformed` is `false` or omitted

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

### Requirement: Init HTTP Endpoint

The system SHALL expose the `runInit` scaffold as an HTTP endpoint at
`POST /api/init` on the Ithyno server, so UI channels (the browser
dashboard directly, Electron and VS Code through follow-up integrations)
can trigger a new-project scaffold without shelling out to the CLI.

Request body (JSON):

```
{
  "dir":           string,   // absolute path required
  "force":         boolean,  // optional, default false
  "skipGitignore": boolean,  // optional, default false
  "autoCreateDir": boolean,  // optional, default false
  "autoGitInit":   boolean   // optional, default false
}
```

The endpoint SHALL delegate to `runInit` with these fields translated
1:1 to its options (with `quiet: true` since the client consumes the
structured response, not the log stream).

Success response (HTTP 200):

```
{
  "ok":               true,
  "target":           string,   // absolute path
  "actions":          array,    // [{ path, action: "create" | "skip" | "overwrite" }]
  "gitignoreResult":  string,   // "created" | "appended" | "already-present" | "skipped"
  "summary":          object,   // { created, overwritten, skipped }
  "openspecMissing":  boolean,
  "gitInitPerformed": boolean
}
```

Failure responses:

- **HTTP 400** with `{ ok: false, reason: "..." }` when the body is
  malformed (missing `dir`, `dir` is not a string, `dir` is not absolute).
- **HTTP 403** with `{ error: "local only" }` when the request originates
  from a non-loopback address, matching the existing `isLocal` guard used
  by `POST /api/git/init`, `POST /api/config/agmsg`, and the agent
  runner endpoints.
- **HTTP 500** with `{ ok: false, exitCode, reason }` when `runInit`
  fails preflight even after the auto-recovery flags. `exitCode` mirrors
  the CLI (2 for preflight failure).

Authentication SHALL follow the existing local-only guard used by
`POST /api/git/init` and `POST /api/config/agmsg`: the request's remote
address MUST be a loopback address (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`,
or a `127.*` prefix). Non-local requests SHALL receive HTTP 403 with
`{ error: "local only" }`.

The endpoint SHALL reject relative paths in `dir` with HTTP 400 —
resolving relative paths against the server's cwd is unsafe across
channels (Electron vs standalone bin/ithyno.js run from different
directories).

#### Scenario: happy path returns the full report
- **GIVEN** an authenticated request with a valid absolute `dir` on a fresh directory the server can write to
- **AND** `autoCreateDir: true` and `autoGitInit: true`
- **WHEN** `POST /api/init` runs
- **THEN** the endpoint returns HTTP 200 with `ok: true`, `gitInitPerformed: true`, an `actions` array of six creates, and `summary.created === 6`

#### Scenario: relative dir rejected
- **GIVEN** an authenticated request with `dir: "./sub"`
- **WHEN** the endpoint validates the body
- **THEN** it returns HTTP 400 with `reason` naming that `dir` must be absolute, and does not invoke `runInit`

#### Scenario: non-local request rejected
- **GIVEN** a request from a remote address that is NOT a loopback address (e.g. `10.0.0.5`)
- **WHEN** the endpoint receives it
- **THEN** it returns HTTP 403 with `{ error: "local only" }` before touching the body or filesystem

#### Scenario: preflight failure surfaces as 500 with reason
- **GIVEN** an authenticated request whose `dir` does not exist AND `autoCreateDir: false`
- **WHEN** the endpoint invokes `runInit`
- **THEN** `runInit` returns `{ ok: false, exitCode: 2, reason: "Target directory does not exist: ..." }` and the endpoint forwards it as HTTP 500 with the same body

#### Scenario: server does not resolve dir against its own cwd
- **GIVEN** the server's cwd is `/Users/alice/openspec-ui` and the request body has an absolute `dir: "/tmp/project-foo"`
- **WHEN** the endpoint runs
- **THEN** it operates on `/tmp/project-foo` regardless of the server cwd

#### Scenario: minimum body validation
- **GIVEN** a request body `{}` with no `dir`
- **WHEN** the endpoint validates the body
- **THEN** it returns HTTP 400 with a reason naming `dir` as required

