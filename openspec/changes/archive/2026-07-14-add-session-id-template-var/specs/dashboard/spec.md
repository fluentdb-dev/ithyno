# Delta: dashboard — add `${session_id}` template variable

## ADDED Requirements

### Requirement: Template Variable Session Id

The `AgentRegistry.resolve()` template-substitution pass SHALL
recognize `${session_id}` as a fourth template variable (alongside
`${change_id}`, `${worktree_path}`, and `${branch}`). The variable
SHALL be substituted in `args`, `env` values, and in the per-role
resolved prompt string.

The value SHALL come from a new `session_id: string` field on the
`vars` object passed to `resolve()`. When the field is absent or
empty, `${session_id}` SHALL be replaced with the literal empty
string — matching the "always-defined" convention of the other
template vars.

#### Scenario: session_id substituted in args
- **GIVEN** an agent with `args: [--session, "${session_id}"]` and no runtime
- **WHEN** the runner calls `resolve()` with `vars.session_id = "session-add-foo-lz9k"`
- **THEN** the resolved args are `[--session, "session-add-foo-lz9k"]`

#### Scenario: session_id substituted in env
- **GIVEN** an agent with `env: { AGENT_SESSION_ID: "${session_id}" }`
- **WHEN** `resolve()` is called with `vars.session_id = "session-add-bar-lz9k4q"`
- **THEN** the resolved `env.AGENT_SESSION_ID` is `"session-add-bar-lz9k4q"`

#### Scenario: session_id substituted in resolved prompt
- **GIVEN** an agent with `prompts: { code: "/opsx:apply ${change_id} in session ${session_id}" }`
- **WHEN** `resolve()` runs with `change_id: "add-foo"` and `session_id: "session-add-foo-lz9k"`
- **THEN** the resolved prompt reads `"/opsx:apply add-foo in session session-add-foo-lz9k"`

#### Scenario: empty session_id substituted as empty string
- **GIVEN** an agent with `args: [--session, "${session_id}"]`
- **WHEN** `resolve()` is called with `vars.session_id = ""` (or the field is omitted)
- **THEN** the resolved args are `[--session, ""]` (literal empty string, not the unresolved `${session_id}` token)

#### Scenario: Manager initialInput with ${session_id} substitutes to empty
- **GIVEN** the Manager agent declares `initialInput: "/opsx:manage ${session_id}"`
- **WHEN** the PTY panel resolves the auto-launch line (no dispatch-level session context)
- **THEN** the injected `initialInput` reads `"/opsx:manage "` (trailing empty substitution)

### Requirement: Change-Scoped Session Id Persistence

The system SHALL persist per-change session IDs in
`.ithyno/sessions.json` under the project root as a JSON object
whose keys are OpenSpec change IDs and whose values are the string
session IDs. The store SHALL survive server restarts.

The module `server/agents/session-store.ts` SHALL export:

- `getOrCreateSessionId(projectRoot, changeId): Promise<string>` —
  reads `.ithyno/sessions.json`; when the file / directory does not
  exist SHALL treat the map as empty. Returns the existing value
  for `changeId` when set. Otherwise SHALL mint a new value of
  shape `session-<changeId>-<base36-timestamp>` (timestamp taken
  once at mint time and encoded so the ID is stable across future
  reads), write the updated map back atomically, and return the
  new value.
- `getSessionId(projectRoot, changeId): Promise<string | null>` —
  read-only lookup returning `null` when the file / key is absent.

Writes SHALL be atomic: write to `.ithyno/sessions.json.tmp` then
`rename` to `.ithyno/sessions.json`. A corrupt / unparseable file
SHALL be treated as an empty map with a warning log; the next mint
overwrites the corrupt file.

The `.ithyno/` directory SHALL be added to `.gitignore` so this
local state does not leak into commits.

#### Scenario: First call for a change mints and persists
- **GIVEN** `.ithyno/sessions.json` does not exist
- **WHEN** `getOrCreateSessionId(root, "add-foo")` is called
- **THEN** the return value matches `/^session-add-foo-[0-9a-z]+$/`
- **AND** `.ithyno/sessions.json` is written containing exactly `{ "add-foo": "<returned-id>" }`

#### Scenario: Second call returns the same ID
- **GIVEN** `.ithyno/sessions.json` contains `{ "add-foo": "session-add-foo-lz9k" }`
- **WHEN** `getOrCreateSessionId(root, "add-foo")` is called
- **THEN** the return value is `"session-add-foo-lz9k"`
- **AND** the file's timestamp is unchanged

#### Scenario: Session persists across server restart
- **GIVEN** `getOrCreateSessionId(root, "add-foo")` returned `"session-add-foo-lz9k"` before shutdown
- **WHEN** the process restarts and `getOrCreateSessionId(root, "add-foo")` is called again
- **THEN** the return value is still `"session-add-foo-lz9k"`

#### Scenario: Second call for a different change mints a distinct ID
- **GIVEN** `.ithyno/sessions.json` contains `{ "add-foo": "session-add-foo-lz9k" }`
- **WHEN** `getOrCreateSessionId(root, "add-bar")` is called
- **THEN** the return value is a new ID matching `/^session-add-bar-[0-9a-z]+$/`
- **AND** the returned ID is not equal to `"session-add-foo-lz9k"`
- **AND** the file now contains both keys

#### Scenario: Read-only getSessionId returns null when unset
- **GIVEN** `.ithyno/sessions.json` does not exist
- **WHEN** `getSessionId(root, "add-foo")` is called
- **THEN** the return value is `null`
- **AND** the file is NOT created

#### Scenario: Corrupt sessions.json recovers on next mint
- **GIVEN** `.ithyno/sessions.json` contains the literal string `"not-json"`
- **WHEN** `getOrCreateSessionId(root, "add-foo")` is called
- **THEN** a warning is emitted to the server log
- **AND** the returned value is a freshly-minted ID
- **AND** the file is overwritten with a valid map containing only that entry

### Requirement: Dispatch Session Correlation

`POST /api/agents/dispatch` SHALL accept an optional `sessionId`
string in the request body. Resolution order at dispatch time:

1. **Body override** — when `sessionId` is present and non-empty,
   its value flows through as `vars.session_id` unchanged.
2. **Change-scoped lookup** — otherwise, the handler SHALL call
   `getOrCreateSessionId(cwd, input.changeId)` to obtain (and
   mint-if-needed) the per-change sessionId. The call SHALL run
   BEFORE the change-existence check, so a dispatch against a
   non-existent `changeId` still creates a `sessions.json` entry
   (harmless orphan) but the endpoint still returns `404`.

`runner.run()` SHALL accept an optional trailing `sessionId?:
string` parameter added after the existing (`changeId`,
`agentName`, `dispatchedRole`) arguments. The runner SHALL pass
the resolved value into `registry.resolve()` as `vars.session_id`
and record it on the job's new `sessionId?: string` field so
`/api/agents/jobs` responses correlate the job back to the
originating session. Orphan-adopted jobs SHALL leave `sessionId`
undefined.

#### Scenario: Explicit sessionId in body wins
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo", sessionId: "session-explicit-9" }`
- **THEN** the created job's `sessionId` is `"session-explicit-9"`
- **AND** the agent's `${session_id}` template substitution uses `"session-explicit-9"`
- **AND** `.ithyno/sessions.json` is NOT touched by this dispatch

#### Scenario: Missing sessionId falls back to change-scoped store
- **GIVEN** `.ithyno/sessions.json` contains `{ "add-foo": "session-add-foo-lz9k" }`
- **WHEN** a client POSTs `{ role: "code", changeId: "add-foo" }` (no sessionId)
- **THEN** the created job's `sessionId` is `"session-add-foo-lz9k"`

#### Scenario: First dispatch on a fresh change mints the session
- **GIVEN** `.ithyno/sessions.json` has no entry for `add-baz`
- **WHEN** a client POSTs `{ role: "code", changeId: "add-baz" }`
- **THEN** a new sessionId is minted and persisted for `add-baz`
- **AND** the created job's `sessionId` matches the newly-minted value

#### Scenario: Non-existent change mints session but returns 404
- **GIVEN** `openspec/changes/does-not-exist/` is absent
- **WHEN** a client POSTs `{ role: "code", changeId: "does-not-exist" }`
- **THEN** `.ithyno/sessions.json` gains an entry for `does-not-exist`
- **AND** the endpoint returns HTTP 404 with a "change not found" error
- **AND** no job is created

#### Scenario: Orphan-adopted job has no sessionId
- **GIVEN** an orphan worktree is adopted at server startup
- **WHEN** the adopted Job is registered
- **THEN** the Job's `sessionId` is undefined
