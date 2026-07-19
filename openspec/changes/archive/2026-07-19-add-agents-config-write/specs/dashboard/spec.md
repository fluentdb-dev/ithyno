# Delta: dashboard — POST /api/agents/config

## ADDED Requirements

### Requirement: Agents Config Write Endpoint

The system SHALL expose `POST /api/agents/config` accepting a
JSON body that is either an upsert or a delete. The payload shape
matches the post-reshape `agents.yaml` schema (`mode` + `roles[]`
+ `prompts` map, per `reshape-agents-yaml-mode-roles`):

```json
{ "action": "upsert",
  "name": "<kebab-case>",
  "roles": ["<one or more of the accepted role values>"],
  "mode": "single-prompt" | "live-shell",
  "command": "<string; required>",
  "args": ["<string>", ...],
  "prompts": { "<role>": "<string>", ... },
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
- validate the payload against the same `AgentDef` shape rules
  the loader uses (name is kebab-case; `roles` non-empty;
  `mode` one of the accepted values; `concurrency` ≥ 1) and
  return `400` with an informative error message if the payload
  is malformed;
- atomically write the modified `agents.yaml` — write to a
  sibling `.tmp` file first, then rename over the original in a
  single syscall so a crash mid-write leaves either the old
  file or the new file, never partial YAML;
- preserve unrelated top-level keys (`parallelExecution:`,
  `agmsg:`, and any unknown keys) byte-intent via a parse →
  merge → serialize round-trip;
- return `{ "ok": true }` on success (`200`);
- rely on the existing agents.yaml file watcher to trigger the
  registry reload; the handler MAY additionally invoke
  `agentRegistry.load()` synchronously to close the race between
  the write and the client's follow-up `GET /api/agents/config`.

Manager-specific guardrails (delete rejection + singleton) are
described by `Manager Agent Server-Side Singleton Guard`
(landed via `revert-refine-agents-config-modal`, 2026-07-19)
and take precedence over this requirement's generic
validate → write path.

#### Scenario: Upsert on existing agent overwrites in place

- **GIVEN** `agents.yaml` contains an agent `claude-code` with `roles: [code]`
- **WHEN** a client POSTs `{ action: "upsert", name: "claude-code", roles: ["review"], mode: "single-prompt", command: "claude", args: [], prompts: { review: "/opsx:review ${change_id}" }, specialties: [], concurrency: 1, dedicated: false }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list contains one entry named `claude-code`
  with `roles: [review]` and no duplicate `claude-code` entry
- **AND** the top-level `parallelExecution:` key and any other unrelated keys
  survive byte-intent

#### Scenario: Upsert on missing name creates a new agent

- **GIVEN** `agents.yaml` does not contain any agent named `reviewer`
- **WHEN** a client POSTs `{ action: "upsert", name: "reviewer", roles: ["review"], mode: "single-prompt", command: "claude", args: [], prompts: {}, specialties: [], concurrency: 1, dedicated: false }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list has a new entry named `reviewer`
  at the end

#### Scenario: Delete removes the entry

- **GIVEN** `agents.yaml` contains `claude-code` and `reviewer`
- **WHEN** a client POSTs `{ action: "delete", name: "reviewer" }`
- **THEN** the response is `{ ok: true }` (200)
- **AND** the file's `agents:` list contains only `claude-code`

#### Scenario: Delete on missing name returns 404

- **GIVEN** `agents.yaml` contains only `claude-code`
- **WHEN** a client POSTs `{ action: "delete", name: "nonexistent" }`
- **THEN** the response is `404` with `{ error: "agent 'nonexistent' not found" }`
- **AND** the file is unchanged

#### Scenario: Malformed payload rejected without writing

- **GIVEN** a POST body missing the `action` discriminator, or with
  `concurrency: 0`, or with `roles: []`, or with an unknown `mode`
- **WHEN** the handler processes it
- **THEN** the response is `400` with an error message naming the
  first-failed field
- **AND** `agents.yaml` is byte-identical to before the request

#### Scenario: Non-local request rejected

- **GIVEN** a POST from a non-loopback source
- **WHEN** the handler is invoked
- **THEN** the response is `403` with `{ error: "local only" }`
- **AND** `agents.yaml` is byte-identical to before the request

#### Scenario: Missing session token rejected

- **GIVEN** a POST from a loopback source with no `x-session-token` header and no `?token=` query parameter
- **WHEN** the handler is invoked
- **THEN** the CSRF hook responds `401` with `{ error: "auth required" }` before the endpoint runs
- **AND** `agents.yaml` is byte-identical to before the request
