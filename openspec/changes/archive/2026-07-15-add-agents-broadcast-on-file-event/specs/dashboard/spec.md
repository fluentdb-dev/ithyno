# Delta: dashboard — broadcast `agents-updated` on external agents.yaml edits

## ADDED Requirements

### Requirement: Agents Config Live Updates

The server SHALL broadcast an `agents-updated` WebSocket event
whenever the agent registry reloads due to a file-system change to
`agents.yaml`. The event payload SHALL carry the fresh
`publicConfig()` result (agents list, runtimes map, load-time
warnings) so subscribed clients can update their store without
issuing a separate `GET /api/agents/config` request.

Event shape:

```
{ type: "agents-updated",
  agents: AgentPublic[],
  runtimes: Record<string, RuntimeDef>,
  warnings: string[] }
```

The broadcast SHALL be debounced by at least 100 ms so an atomic
`.tmp → rename` write from an external editor (which can fire
multiple `fs.watch` events per save) produces exactly one broadcast.

The `POST /api/agents/config` handler's existing synchronous
`agentRegistry.load()` (added by `fix: reload agent registry
synchronously after config write`) SHALL be preserved. It handles
the UI-driven Save flow where the client's immediate `loadAgents()`
after Save must see the fresh state via the HTTP round-trip. The
new broadcast fires additionally when `fs.watch` picks up the write
moments later; the redundant client update is idempotent.

The client (`web/src/store.ts`) SHALL subscribe to the new event
and apply the payload to the store's `agents`, `runtimes`, and
`agentConfigError` fields directly. No separate refetch is
required.

#### Scenario: External editor edit triggers broadcast
- **GIVEN** a client has an open WebSocket subscription and is showing the Agents tab
- **WHEN** a user edits `agents.yaml` in an external editor and saves
- **THEN** within 200 ms the client receives an `agents-updated` event with the fresh `agents` list
- **AND** the Agents tab (and Manager section) re-renders with the new state without a page reload

#### Scenario: Modal Save triggers both the HTTP reload and the broadcast
- **GIVEN** a client has an open WebSocket subscription
- **WHEN** the user Saves the Agent config Modal
- **THEN** the `POST /api/agents/config` response contains the fresh state (via `agentRegistry.load()` in the handler)
- **AND** the client's `handleSave` calls `loadAgents()`, which sees the fresh state on the immediate `GET`
- **AND** the client ALSO receives an `agents-updated` broadcast within ~100–200 ms as `fs.watch` fires — the second update is idempotent

#### Scenario: Debounce collapses multiple fs.watch events into one broadcast
- **GIVEN** an atomic write pattern (`.tmp` then `rename`) that fires two `fs.watch` events in quick succession
- **WHEN** both events arrive within the 100 ms debounce window
- **THEN** exactly one `agents-updated` broadcast is sent

#### Scenario: Malformed edit still broadcasts with error state
- **GIVEN** a user hand-edits `agents.yaml` into invalid YAML
- **WHEN** the reload attempts and fails
- **THEN** an `agents-updated` broadcast is sent with the last-known-good `agents` / `runtimes` PLUS the parse error surfaced in the `warnings` array (or via the existing `ok: false / error` shape from `publicConfig`)
- **AND** the client sees the error banner without needing to remount the tab
