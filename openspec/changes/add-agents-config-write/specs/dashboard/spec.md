# Delta: dashboard — POST /api/agents/config

## ADDED Requirements

### Requirement: Agents Config Write Endpoint

The system SHALL expose `POST /api/agents/config` accepting a
JSON body that is either an upsert or a delete:

```json
{ "action": "upsert",
  "name": "<kebab-case>",
  "role": "<one of the accepted role values>",
  "command": "<string; required for legacy shape>",
  "args": ["<string>", ...],
  "runtime": "<string; required for runtime-backed shape>",
  "prompt": "<string; optional for runtime-backed>",
  "specialties": ["<string>", ...],
  "concurrency": <integer ≥ 1>,
  "dedicated": <boolean>,
  "description": "<optional string>"
}
```

or

```json
{ "action": "delete", "name": "<kebab-case>" }
```

The handler SHALL:

- gate on `isLocal(req.socket.remoteAddress)` and the existing
  CSRF hook (return `403` when either fails);
- validate the payload against the same `AgentDef` shape rules the
  loader uses (name is kebab-case; exactly one of legacy vs
  runtime-backed shape; concurrency ≥ 1) and return `400` with an
  informative error message if the payload is malformed;
- atomically write the modified `agents.yaml` — write to a
  sibling `.tmp` file first, then rename over the original in a
  single syscall so a crash mid-write leaves either the old file or
  the new file, never partial YAML;
- preserve unrelated top-level keys (`runtimes:`, `worktreePool:`,
  and any unknown keys) byte-intent via a parse → merge → serialize
  round-trip;
- return `{ "ok": true }` on success (`200`);
- rely on the existing agents.yaml file watcher to trigger the
  registry reload; the handler SHALL NOT invoke `agentRegistry.load()`
  directly.

#### Scenario: upsert on existing agent overwrites in place
- **GIVEN** `agents.yaml` contains an agent `claude` with `role: code`
- **WHEN** a client POSTs `{ action: "upsert", name: "claude", role: "review", ... }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list contains one entry named `claude`
  with `role: review` and no duplicate `claude` entry
- **AND** the top-level `runtimes:` key and any other unrelated keys
  survive byte-intent

#### Scenario: upsert on missing name creates a new agent
- **GIVEN** `agents.yaml` does not contain any agent named `reviewer`
- **WHEN** a client POSTs `{ action: "upsert", name: "reviewer", role: "review", command: "claude", args: [], ... }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list has a new entry named `reviewer`
  at the end

#### Scenario: delete removes the entry
- **GIVEN** `agents.yaml` contains `claude` and `reviewer`
- **WHEN** a client POSTs `{ action: "delete", name: "reviewer" }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list contains only `claude`

#### Scenario: delete on missing name returns 404
- **GIVEN** `agents.yaml` contains only `claude`
- **WHEN** a client POSTs `{ action: "delete", name: "nonexistent" }`
- **THEN** the response is `404` with `{ error: "agent 'nonexistent' not found" }`
- **AND** the file is unchanged

#### Scenario: malformed payload rejected without writing
- **GIVEN** a POST body missing the `action` discriminator, or with
  `concurrency: 0`, or with both `command` and `runtime` set
- **WHEN** the handler processes it
- **THEN** the response is `400` with an error message naming the
  first-failed field
- **AND** `agents.yaml` is byte-identical to before the request

#### Scenario: non-local request rejected
- **GIVEN** a POST from a non-loopback source
- **WHEN** the handler is invoked
- **THEN** the response is `403` with `{ error: "local only" }`
- **AND** `agents.yaml` is byte-identical to before the request
