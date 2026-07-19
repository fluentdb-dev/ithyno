# Delta: project-init — Streaming init endpoint with openspec init chain

## MODIFIED Requirements

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
