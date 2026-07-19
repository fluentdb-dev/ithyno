---
tags: [feature/agents, feature/messaging, area/server, agmsg, spawn-options]
---

# Auto-sync `entry.args` (non-`--model`) into agmsg's spawn_options.yaml

## Why

The workspace user configures agents via the UI's Agents tab
(`POST /api/agents/config` → server writes `agents.yaml`). User-
authored `entry.args` for a live-shell + agmsg worker typically
contains flags the underlying CLI needs — e.g. `claude` requires
`--dangerously-skip-permissions` to run in the trusted-project
mode.

The dispatcher's agmsg branch only threads `--model <id>` on the
`/agmsg spawn` CLI (per `thread-model-arg-through-agmsg-spawn`).
All other CLI flags for the spawned CLI must live in agmsg's own
`~/.agmsg/config/spawn_options.yaml`. That file is currently a
user-hand-authored config outside ithyno's write surface.

Since ithyno's editing model is "user configures via UI, server
persists both sides", the server SHALL auto-sync those non-`--model`
args from `agents.yaml` into `spawn_options.yaml` so the user never
sees the file exists.

## What Changes

### 1. `server/agents/spawn-options-writer.ts` (new)

New module. Public API:

```ts
export async function syncSpawnOptions(
  projectRoot: string,
  cfg: AgentConfig,
): Promise<void>;
```

Behavior:

1. **Guard**: if `cfg.agmsg === null` → no-op (agmsg not configured).
2. **Build per-type args map** from `cfg.agents`:
   - Filter to entries where `mode === "live-shell"` AND `roles`
     does NOT include `manager`.
   - Derive `agmsg-type` from `command` (same mapping table as the
     dispatcher: `claude→claude-code`, `codex→codex`, …). Skip
     unmapped commands silently.
   - Parse `entry.args`: for each token, if it starts with `--`:
     - If next token exists AND does NOT start with `--` AND the
       flag is NOT `--model` → emit `<flag>: <value>` (pair);
       advance i by 2
     - Else → emit `<flag>: true` (boolean); advance i by 1
   - `--model` and its value are always skipped (dispatcher threads
     it separately).
3. **Read existing `spawn_options.yaml`** (if it exists) via the
   same YAML dialect agmsg's `spawn-options.sh` reads.
4. **Merge**:
   - For each agmsg-type present in the new map → replace that
     type's section authoritatively with the new map.
   - Types present in the existing file but NOT in the new map →
     preserved as-is (never delete another type's config).
5. **Write** to `$HOME/.agmsg/config/spawn_options.yaml`, creating
   `~/.agmsg/config/` if missing. Atomic write (temp file +
   rename) for durability.

### 2. `server/agents/config-writer.ts` — invoke on Save

After `applyAgentConfigPayload` writes `agents.yaml` (existing
path), call `syncSpawnOptions(projectRoot, cfg)` with the reloaded
config. The extra work is negligible (write happens only when the
UI Saves).

### 3. `server/index.ts` — invoke on boot

After `registry.load()` completes at startup, call
`syncSpawnOptions(projectRoot, registry.publicConfig())` once
(defensive: catches externally-edited `agents.yaml` at last-boot
time).

### 4. What this change does NOT touch

- **No dispatcher skill change**. The `thread-model-arg` change
  handles the runtime `--model` threading; that's separate.
- **No UI change**. The Agents Config Modal already has the `args`
  field; no new fields, no new controls.
- **No agents.yaml schema change**.
- **No chokidar-driven re-sync**. External edits to `agents.yaml`
  (outside the UI Save path) will not trigger a sync until next
  boot. Documented as a limitation; add a `agents-updated` WS-
  triggered sync in a follow-up if it becomes an issue in practice.
- **No user notification / dialog** about spawn_options.yaml being
  written. Silent auto-management is the intent (user never learns
  the file exists).

## Spec deltas (`dashboard` capability)

- **ADDED** `Auto-Sync Agmsg Spawn Options` — new requirement
  covering the sync module, the two trigger points (boot + Save),
  the boolean-vs-pair emission rules, the merge semantics for
  other types, and the atomic write.

## Impact

- **Affected specs**: `dashboard` — 1 ADDED
- **Affected files**:
  - `server/agents/spawn-options-writer.ts` (new)
  - `server/agents/spawn-options-writer.test.ts` (new)
  - `server/agents/config-writer.ts` (invoke sync after write)
  - `server/index.ts` (invoke sync after registry.load)
- **Risk**:
  - **Cross-project conflict**: `~/.agmsg/config/spawn_options.yaml`
    is a single global file. Two ithyno projects on the same
    machine with different args for the same agmsg-type
    (e.g. project A wants `--dangerously-skip-permissions`,
    project B does not) → last-write-wins. Documented; per-project
    override via `AGMSG_SPAWN_OPTIONS_FILE` is a follow-up.
  - **User hand-edited spawn_options.yaml**: the sync overwrites
    the current agmsg-types' sections authoritatively. Other
    types' sections are preserved. If the user hand-edited a
    section for a type ithyno also manages, their edits are
    replaced on next sync. Mitigation: document that ithyno owns
    the sections for its declared agmsg-types.
  - **Missing `~/.agmsg/config/` dir**: `mkdir -p` at write time
    handles it. First-time users see the file appear silently.
- **Migration**: none. Additive; existing installs get the file
  auto-created on next boot or next Save.
