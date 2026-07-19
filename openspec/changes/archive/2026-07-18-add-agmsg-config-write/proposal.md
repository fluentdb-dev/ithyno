---
tags: [feature/agents, feature/messaging, area/server, area/web, agmsg]
---

# Complete the agmsg block's UI write path

## Why

P1 (`add-agmsg-config-block`, archived 2026-07-17) landed the read
side of `agents.yaml`'s top-level `agmsg:` block: parse, validate,
expose via `GET /api/agents/config` and the `agents-updated` WS
event, mirror on the client store. It explicitly stopped short of
adding a write path, on the theory that the field could be edited
directly in `agents.yaml`.

Two follow-ups exposed the gap:

- `state.agmsg` on the client store has zero component consumers
  today — the WS payload arrives but no UI reads it, so the mirror
  is inert.
- Users editing agents.yaml by hand contradicts ithyno's editing
  model, which is "user configures via the UI, server persists both
  sides atomically" (per Agents Config Modal, Settings tab's
  `parallelExecution` toggle, git identity form, etc.).

This change closes the gap by adding a small write path — Settings
tab form + `POST /api/config/agmsg` endpoint + `writeAgmsg` in
`config-writer.ts` — that turns the currently-inert client mirror
into a functional read+write surface.

## What Changes

### 1. Server: `writeAgmsg(projectRoot, block)` in config-writer.ts

New writer sibling to `writeParallelExecution`. Signature:

```ts
export async function writeAgmsg(
  projectRoot: string,
  block: AgmsgConfig | null,
): Promise<ApplyResult>;
```

Behavior:

- **`block === null`** → remove the top-level `agmsg:` key from
  `agents.yaml` if present; no-op if absent.
- **`block !== null`** → validate (`team` required non-empty
  string; `storage` optional non-empty string) then upsert the
  top-level `agmsg:` key with the given shape.
- Round-trip preserves the `agents:` list and any other top-level
  keys (`parallelExecution`, `worktreePool`, etc.), same as
  `writeParallelExecution`.
- Atomic write (temp file + rename) same as existing writers.

### 2. Server: `POST /api/config/agmsg`

New endpoint mirroring `POST /api/config/parallel-execution`.
Accepts:

```jsonc
{
  "enabled": true,
  "team": "openspec-ui",
  "storage": ".worktrees/.agmsg.sqlite"  // optional
}
// OR
{
  "enabled": false                        // removes the block
}
```

- Non-local origins → 403 (same guard the other config endpoints
  already have).
- `enabled: true` + missing/empty `team` → 400 with the same error
  wording the loader uses (`agmsg.team is required when the agmsg
  block is present`).
- Success → server broadcasts the existing `agents-updated` WS
  event with the fresh `agmsg` in payload. No new event type.

### 3. Client: Settings form

Extend `web/src/pages/Settings.tsx` with a new section under
`Execution`:

```
Agmsg (multi-agent messaging)
┌─────────────────────────────────────────┐
│ ☑ Enable                                │
│                                         │
│   Team name  [openspec-ui____________]  │
│              (required when enabled)    │
│                                         │
│   Storage    [_____________________]    │
│              (optional; default:        │
│               ~/.agents/skills/agmsg/   │
│               db/messages.db)           │
│                                         │
│   [Save agmsg config]                   │
└─────────────────────────────────────────┘
```

- Enable toggle — off state means `POST /api/config/agmsg
  { enabled: false }` which removes the block.
- Team required only when Enable is on.
- Storage optional; empty means "use default".
- Local component state for form draft; `Save` button posts and
  the WS broadcast updates `state.agmsg`, which the form re-reads
  as the source of truth.
- Toasts on success / error via the existing `pushToast` channel.

### 4. Client API + store

- `web/src/api.ts` — add `setAgmsgConfig(payload)` mirroring
  `setParallelExecution`.
- `web/src/store.ts` — the `agmsg` slice already exists; the
  Settings form is its first real consumer.

### 5. What this change does NOT touch

- **No `agents.yaml` schema change**. The block shape stays
  `{ team, storage? }` as landed in P1.
- **No auto-sync change**. `auto-sync-agmsg-spawn-options`
  continues to fire on Save (the writer path already exists there);
  no new hooks.
- **No dispatcher skill change**. `--model` threading and unknown-
  command escalation stay as they are.
- **No new WS event type**. Reuses `agents-updated`.
- **No Agents Config Modal change**. Individual agent entries
  remain owned by that modal; the workspace-level agmsg block is
  a Settings-tab concern (matches `parallelExecution`).

## Spec deltas (`dashboard` capability)

- **ADDED** `Agmsg Config Write Endpoint` — server contract for
  `POST /api/config/agmsg`, the payload shape, and the atomic
  round-trip.
- **MODIFIED** `Settings Tab` — extend the tab requirement to
  include the agmsg section alongside the parallel-execution
  toggle.

## Impact

- **Affected specs**: `dashboard` — 1 ADDED + 1 MODIFIED
- **Affected code**:
  - `server/agents/config-writer.ts` — `writeAgmsg` function
  - `server/agents/config-writer.test.ts` — round-trip tests
  - `server/index.ts` — new endpoint
  - `web/src/api.ts` — `setAgmsgConfig` API call
  - `web/src/pages/Settings.tsx` — new section
- **Risk**:
  - The Settings form and the Agents Modal both mutate
    `agents.yaml`. The Modal's write path already tolerates other
    top-level keys via `{ ...doc, agents: list }` spread; the
    same pattern applies here. Test lock for both flows.
  - If the user disables agmsg while the current tmux session is
    live, the running PTY doesn't change mid-session (the tmux
    wrap decision is made at spawn time). Documented; the user
    reopens the Terminal panel to pick up the change.
- **Migration**: none. Existing installs see the new form; empty
  form = no block (existing behavior).
