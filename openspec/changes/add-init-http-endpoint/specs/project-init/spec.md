# Delta: project-init — HTTP endpoint + autoCreateDir / autoGitInit options

## MODIFIED Requirements

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

## ADDED Requirements

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
- **HTTP 401** with `{ error: "auth required" }` when the request lacks
  a valid CSRF token, matching the existing gated endpoints.
- **HTTP 500** with `{ ok: false, exitCode, reason }` when `runInit`
  fails preflight even after the auto-recovery flags. `exitCode` mirrors
  the CLI (2 for preflight failure).

Authentication SHALL follow the existing pattern used by
`POST /api/changes/:id/phase` and `POST /api/config/agmsg`: a CSRF token
header issued to the same-origin dashboard session.

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

#### Scenario: unauthenticated rejected
- **GIVEN** a request without a valid CSRF token
- **WHEN** the endpoint receives it
- **THEN** it returns HTTP 401 with `{ error: "auth required" }` before touching the body or filesystem

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
