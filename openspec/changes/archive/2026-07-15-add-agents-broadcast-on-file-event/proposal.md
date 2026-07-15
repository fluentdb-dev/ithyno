---
tags: [area/server, area/web, feature/agents-yaml, live-updates]
---

# Broadcast `agents-updated` on external `agents.yaml` edits

## Why

`agentRegistry.startWatching()` uses `fs.watch()` to reload the
registry when `agents.yaml` changes on disk. The reload runs
server-side, but there's no WebSocket broadcast — clients don't know
about the change until they refresh the Agents tab or perform a
Modal Save.

Symptom: user hand-edits `agents.yaml` in an editor → registry is
updated but the Agents tab (and any consumer of `agents` state,
including the Manager section) shows stale data until the user
navigates away and back.

Kanban has the equivalent via `Watcher` broadcasting `change-updated`
/ `tags-updated` etc. Agents deserves the same treatment.

## What Changes

### Server

1. Add `{ type: "agents-updated"; agents: AgentPublic[]; runtimes: Record<string, RuntimeDef>; warnings: string[] }` to the `ServerEvent` union in `server/index.ts`.

2. In `agentRegistry.startWatching()`'s callback (currently only
   clears runtime detection cache), broadcast the event with the
   fresh `publicConfig()` payload. Fire-and-forget; no client
   round-trip needed.

3. Coalesce rapid consecutive fires (fs.watch on macOS can double-fire
   on atomic rename). Debounce ~100 ms so a `.tmp → rename` sequence
   produces one broadcast, not two.

### Client

4. `web/src/store.ts` — subscribe to `agents-updated` in the
   WebSocket message handler. On receipt, update `agents`,
   `runtimes`, and any related state directly from the event payload
   (no separate `loadAgents()` fetch — the payload is fresh).

5. `Agents.tsx` — no changes needed. It already reads from store.

### Interaction with the existing POST-reload

- `POST /api/agents/config` still does `await agentRegistry.load()`
  synchronously (commit e43b1d1). That covers the Modal Save flow —
  the client's immediate `loadAgents()` after Save sees the fresh
  state via the HTTP round-trip.
- The new broadcast additionally fires when `fs.watch` picks up the
  file change moments later. The client receives it, updates store
  again — **redundant but idempotent** for the Modal Save path.
- For external editor edits (NO POST), the broadcast is the only
  mechanism; the client update is essential.

### Spec deltas

6. **ADDED**: `Agents Config Live Updates`.

## Impact

- Backward compatible on the wire: existing clients ignoring an
  unknown event type see no behavior change.
- Debounce keeps event volume sane on editors that write atomically
  (multiple fs.watch events per save).
- No new HTTP round-trip; the broadcast payload carries the fresh
  config, so the client doesn't need to GET.

## Out of scope

- **Full-file diff broadcast** (per-agent add/remove/update events).
  For the current scale (< 20 agents typically), the whole payload
  is trivial to send and the diff logic isn't worth the complexity.
- **Client-side optimistic updates** for external edits. If two
  clients edit simultaneously, last-write-wins per the existing
  file-based storage. No conflict UI.
- **Retry / reconnect handling** for missed broadcasts. Existing WS
  reconnect logic (in `web/src/store.ts`) should already refetch
  agents on reconnect via `loadAgents()`.
