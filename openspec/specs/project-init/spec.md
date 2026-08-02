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
The system SHALL keep the scaffold templates inside this package under a `templates/` directory so they evolve alongside the code and version with each release.

`templates/` SHALL hold ONLY CLI-neutral fixtures — files that get copied verbatim into every scaffolded project regardless of the Manager CLI the user picked (e.g. `CLAUDE.md` as agent-facing context, `openspec/README.md`, `agents.yaml.tmpl`). CLI-specific skill surface files (`.claude/commands/opsx/…`, `.claude/skills/ithy-opsx-*/`, and any other CLI's equivalent) SHALL NOT live under `templates/` — they are emitted by the per-CLI renderers described in the `cross-cli-skill-installer` capability.

#### Scenario: Templates resolved relative to package root
- **WHEN** the init handler reads its templates
- **THEN** it resolves the path from the package's own location, not from the user's working directory

#### Scenario: Generic CLAUDE.md template
- **WHEN** the CLAUDE.md template is copied
- **THEN** it contains generic placeholders for project-specific commands (no `npm test`-style references that would mislead non-Node projects)

#### Scenario: templates directory holds only CLI-neutral fixtures
- **GIVEN** the packaged `templates/` tree
- **WHEN** the init flow walks it
- **THEN** it finds only files that apply to every Manager CLI (e.g. `CLAUDE.md`, `openspec/README.md`, `agents.yaml.tmpl`, top-level dotfile scaffolds)
- **AND** it finds no `templates/.claude/commands/opsx/`, `templates/.claude/commands/ithy-opsx/`, or `templates/.claude/skills/ithy-opsx-*` subtrees (those are renderer output)

### Requirement: .gitignore Maintenance

The system SHALL ensure both `.worktrees/` AND `.ithyno/` appear in
the target project's `.gitignore`, creating the file if necessary
and otherwise appending only the lines that are missing. Both
entries are project-local state and MUST NOT be committed:

- `.worktrees/` — agent worktree scratch directories.
- `.ithyno/` — project-local ithyno state, including the per-project
  Claude Code session UUID (`.ithyno/session-id`) added by
  `pty-startup-uses-project-session-id`.

The append-only-if-missing check SHALL be per-line. Adding one line
does NOT remove or reorder the other. A `.gitignore` that already
has both lines SHALL be reported as `already-present`.

#### Scenario: Create fresh gitignore with both lines
- **WHEN** `.gitignore` does not exist and the caller invokes `updateGitignore`
- **THEN** the file is created with both `.worktrees/` and `.ithyno/`, one per line, each terminated with `\n`

#### Scenario: Append `.ithyno/` when only `.worktrees/` exists
- **GIVEN** `.gitignore` contains `.worktrees/` but not `.ithyno/`
- **WHEN** `updateGitignore` runs
- **THEN** `.ithyno/` is appended (preserving prior content, including any trailing newline behavior)
- **AND** the file ends with a single trailing `\n`

#### Scenario: Append `.worktrees/` when only `.ithyno/` exists
- **GIVEN** `.gitignore` contains `.ithyno/` but not `.worktrees/`
- **WHEN** `updateGitignore` runs
- **THEN** `.worktrees/` is appended

#### Scenario: Both lines already present
- **WHEN** `.gitignore` already contains both `.worktrees/` and `.ithyno/`
- **THEN** the command leaves the file untouched and reports `already-present`

#### Scenario: Idempotent re-run
- **GIVEN** any starting `.gitignore` (or none)
- **WHEN** `updateGitignore` is invoked repeatedly
- **THEN** after the first call the file contains exactly one occurrence of `.worktrees/` and exactly one occurrence of `.ithyno/`; subsequent calls report `already-present` and do not modify the file

#### Scenario: Opt out
- **WHEN** the user passes `--no-gitignore` to `ithyno init` (or the equivalent programmatic `{ skipGitignore: true }`)
- **THEN** the command does not modify or create `.gitignore` at all — neither `.worktrees/` nor `.ithyno/` are added

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
The system SHALL ALSO expose a **streaming sibling** at
`POST /api/init/stream` that runs the two-step new-project chain
(`runInit` then `openspec init`) and emits progress events as
Server-Sent Events (`text/event-stream`), for consumption by the
shared onboarding page (see `dashboard` capability's `Onboarding
Project Page` requirement).

Both endpoints SHALL share the same request body validation and the
same authentication guard (global CSRF token check + per-endpoint
`isLocal`).

#### `POST /api/init` (synchronous, unchanged from add-init-http-endpoint)

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
  "target":           string,
  "actions":          array,
  "gitignoreResult":  string,
  "summary":          object,
  "openspecMissing":  boolean,
  "gitInitPerformed": boolean
}
```

Failure responses:

- **HTTP 400** with `{ ok: false, reason: "..." }` when the body is
  malformed (missing `dir`, `dir` is not a string, `dir` is not absolute).
- **HTTP 403** with `{ error: "local only" }` when the request originates
  from a non-loopback address.
- **HTTP 500** with `{ ok: false, exitCode, reason }` when `runInit`
  fails preflight even after the auto-recovery flags.

Authentication SHALL follow the existing local-only guard used by
`POST /api/git/init` and `POST /api/config/agmsg`.

The endpoint SHALL reject relative paths in `dir` with HTTP 400.

#### `POST /api/init/stream` (streaming, added by add-new-project-onboarding-window)

Same request body as `POST /api/init`. The endpoint SHALL:

1. Perform the same auth + validation as the synchronous endpoint.
   On validation / auth failure, return the same HTTP 400 / 403 / 415
   codes with the same JSON bodies — NO stream is opened.
2. On success, write HTTP 200 with `Content-Type: text/event-stream`
   and start emitting SSE frames as `runNewProjectChain(dir, onEvent)`
   produces `ChainEvent`s. Each event is one frame:

   ```
   data: {"type":"step-start","step":"scaffold"}\n
   \n
   data: {"type":"log","step":"scaffold","line":"create: CLAUDE.md","stream":"stdout"}\n
   \n
   data: {"type":"complete","target":"/tmp/new-proj"}\n
   \n
   ```

3. Close the response stream after emitting the terminal event
   (`complete` or `error`). Do NOT keep the connection open past
   completion.
4. If the underlying HTTP connection closes early (client
   disconnected), the chain SHALL continue to completion server-side;
   any events after disconnect are discarded silently. The subprocess
   is NOT killed.
5. Emit an `error` event and close the stream if `runNewProjectChain`
   fails (either step). The `error` event has `{ type: 'error', step,
   message }`; no separate HTTP error code is used because the
   stream already succeeded to open.

The chain SHALL be the two-step sequence defined by the shared
`runNewProjectChain(target, onEvent)` in `bin/new-project-chain.js`:

1. **`scaffold`** — invoke `runInit({ targetDir: target,
   autoCreateDir: true, autoGitInit: true, quiet: true, log })` and
   forward each `log` line as a `log` event with `step: 'scaffold'`
   and `stream: 'stdout'`. On `runInit` failure (`{ ok: false }`),
   emit `error` and stop.
2. **`openspec-init`** — spawn `npx -y -p @fission-ai/openspec@latest
   openspec init <target> --tools claude` with `cwd: target`. Each
   stdout / stderr chunk is line-split and emitted as `log` events
   with the corresponding `stream` field. On non-zero exit, emit
   `error` and stop.

Both endpoints SHALL share the request body validator (a single
function), so behavior is identical for `dir` shape, `autoCreateDir`
etc.

#### Scenario: happy path returns the full report (synchronous)
- **GIVEN** an authenticated request to `POST /api/init` with a valid absolute `dir` on a fresh directory the server can write to
- **AND** `autoCreateDir: true` and `autoGitInit: true`
- **WHEN** the endpoint runs
- **THEN** it returns HTTP 200 with `ok: true`, `gitInitPerformed: true`, an `actions` array of six creates, and `summary.created === 6`

#### Scenario: relative dir rejected (both endpoints)
- **GIVEN** an authenticated request with `dir: "./sub"` to either endpoint
- **WHEN** the endpoint validates the body
- **THEN** it returns HTTP 400 with `reason` naming that `dir` must be absolute, no stream is opened, and `runInit` is NOT invoked

#### Scenario: non-local request rejected (both endpoints)
- **GIVEN** a request from a remote address that is NOT a loopback address (e.g. `10.0.0.5`)
- **WHEN** the endpoint receives it
- **THEN** it returns HTTP 403 with `{ error: "local only" }` before touching the body or filesystem, no stream is opened

#### Scenario: preflight failure surfaces as 500 with reason (synchronous)
- **GIVEN** an authenticated request whose `dir` does not exist AND `autoCreateDir: false` at `POST /api/init`
- **WHEN** the endpoint invokes `runInit`
- **THEN** `runInit` returns `{ ok: false, exitCode: 2, reason: "..." }` and the endpoint forwards it as HTTP 500 with the same body

#### Scenario: server does not resolve dir against its own cwd
- **GIVEN** the server's cwd is `/Users/alice/openspec-ui` and the request body has an absolute `dir: "/tmp/project-foo"`
- **WHEN** either endpoint runs
- **THEN** it operates on `/tmp/project-foo` regardless of the server cwd

#### Scenario: minimum body validation
- **GIVEN** a request body `{}` with no `dir` at either endpoint
- **WHEN** the endpoint validates the body
- **THEN** it returns HTTP 400 with a reason naming `dir` as required

#### Scenario: streaming endpoint emits SSE frames
- **GIVEN** an authenticated request to `POST /api/init/stream` with a valid absolute `dir`
- **WHEN** the chain runs to completion
- **THEN** the response has `Content-Type: text/event-stream`, one `data: <json>` frame per `ChainEvent`, terminating in a `data: {"type":"complete","target":"..."}` frame followed by connection close

#### Scenario: streaming client disconnects mid-chain
- **GIVEN** a client is consuming `POST /api/init/stream`
- **AND** the connection closes during the `openspec-init` step
- **WHEN** the server writes the next event
- **THEN** the write fails silently, the subprocess continues, and the chain runs to completion server-side; no crash, no state corruption

#### Scenario: streaming error emits error frame and closes
- **GIVEN** `openspec init` exits with a non-zero code
- **WHEN** the server observes the exit
- **THEN** it emits a final `data: {"type":"error","step":"openspec-init","message":"..."}` frame and closes the stream; no HTTP status change (stream already opened as 200)

