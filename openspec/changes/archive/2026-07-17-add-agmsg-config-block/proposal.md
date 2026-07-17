---
tags: [feature/agents, feature/messaging, area/server, area/web, agmsg, phase-1-of-3]
---

# Add `agmsg` top-level config block to agents.yaml

## Why

The larger goal (documented in `docs/ideas/2026-07-06-cross-agent-messaging.md`,
and the design conversation on 2026-07-17) is to integrate
[fujibee/agmsg](https://github.com/fujibee/agmsg) so live-shell agents
can be triggered via messages rather than manual PTY typing, and so
multiple agents can co-exist inside the same embedded terminal via
tmux panes. The design landed on **Flavor D** (PTY → tmux → agmsg):

```
xterm.js (browser)
 └─ node-pty (server)
      └─ tmux new-session -s ithyno
           ├─ pane 0: claude (manager)
           ├─ pane 1: codex (peer reviewer, agmsg-spawned)
           └─ pane N: ...
```

Implementation is split across three proposals so each step is
verifiable in isolation:

- **P1 (this change)**: agents.yaml top-level `agmsg` config block +
  server exposure, no runtime change.
- **P2 (`route-live-shell-to-tmux-agmsg`, later)**: PTY spawn command
  changes to `tmux new-session`; manager bootstrap loads agmsg;
  dispatcher routes to `agmsg send` for live-shell workers.
- **P3 (`bundle-agmsg-in-electron`, later)**: Electron distribution
  vendors agmsg shell scripts under `extraResources`; tmux stays
  system-provided (macOS/Linux ship it; Windows path is a
  future concern).

## What Changes

### 1. `agents.yaml` schema — new top-level `agmsg` block

```yaml
# agents.yaml
agmsg:
  team: openspec-ui           # required when the block is present
  storage: .worktrees/.agmsg.sqlite  # optional; default is agmsg's
                                     # own path (~/.agents/skills/
                                     # agmsg/db/messages.db)

agents:
  - name: pptr
    mode: live-shell
    roles: [manager]
    command: claude
    args: [--resume, <session-id>]
```

Fields:

- `team: string` (required when the block is present). Names the
  agmsg team room. Convention: use a project-scoped name to avoid
  cross-project message leakage.
- `storage?: string` (optional). Path to the SQLite messages DB. When
  omitted, agmsg's default (`~/.agents/skills/agmsg/db/messages.db`)
  is used. Ithyno users who want workspace-local isolation set this
  to something under `.worktrees/`.

Absence of the block means agmsg is not configured — same as today.

### 2. Server: parse + validate + expose

- `server/agents/registry.ts`: parse the top-level `agmsg` block.
  Reject when the block exists but `team` is missing or empty.
- `server/model.ts`: `WorkspaceState.agmsg: { team, storage } | null`
  (null when the block is absent).
- `server/parser/workspace.ts`: populate `state.agmsg` from the
  registry.
- `GET /api/agents/config` response gains an `agmsg` field carrying
  the same block (mirror shape).

### 3. Client: types + store

- `web/src/types.ts`: `WorkspaceState.agmsg`, `AgentConfigResponse.
  agmsg`.
- `web/src/store.ts`: no new derived state; consumers read
  `state.agmsg` directly.

### 4. What this change does NOT touch

- **No runtime spawn**. Nothing invokes tmux, nothing runs `agmsg`
  binaries yet. `state.agmsg` is metadata-only in P1.
- **No `mode` value changes**. `mode: live-shell` still means what it
  means today (embedded PTY, user-typed inject).
- **No dispatcher routing changes**. `/ithy-opsx:dispatch` still uses
  Task tool for claude, subprocess for others.
- **No Electron bundling**. That's P3.
- **No `agents.yaml.example` update** (deferred to P2 when the block
  actually starts doing something).

## Spec deltas (`dashboard` capability)

- **ADDED** `Agmsg Config Block In agents.yaml` — schema, validation,
  round-trip.

## Impact

- **Affected specs**: `dashboard` — 1 ADDED
- **Affected code**:
  - `server/agents/registry.ts` (parse + validate)
  - `server/agents/config-writer.ts` (round-trip on upsert if the
    block exists — but block isn't editable from the UI in P1)
  - `server/model.ts` + `web/src/types.ts` (state.agmsg)
  - `server/parser/workspace.ts` (populate)
  - `server/index.ts` (`/api/agents/config` response includes agmsg)
  - `server/agents/registry.test.ts` (block-present / block-absent /
    block-invalid tests)
- **Risk**:
  - Users on old `agents.yaml` (no `agmsg` block) see zero behavior
    change. The block is purely additive.
  - `config-writer.ts` currently rewrites the whole doc on upsert; if
    the block exists, we preserve it through the round-trip. Test
    added for that case.
- **Migration**: none. Optional block, backward compatible.
