# Delta: dashboard — auto-sync entry.args into agmsg spawn_options.yaml

## ADDED Requirements

### Requirement: Auto-Sync Agmsg Spawn Options

The server SHALL auto-sync non-`--model` CLI flags from live-shell
worker `entry.args` in `agents.yaml` into agmsg's
`~/.agmsg/config/spawn_options.yaml` so the user only touches the
Agents Config Modal, never the agmsg config file directly.

The sync SHALL run at two trigger points:

1. **Server boot**, after `registry.load()` returns and the initial
   AgentConfig is populated.
2. **On `POST /api/agents/config`**, after `applyAgentConfigPayload`
   finishes writing `agents.yaml`, using the reloaded config.

The sync SHALL:

- Be a no-op when `cfg.agmsg === null` (agmsg not configured).
- Consider only entries where `mode === "live-shell"` AND `roles`
  does NOT include `"manager"`. Manager entries never spawn via
  agmsg and MUST NOT appear in `spawn_options.yaml`.
- Derive `<agmsg-type>` from `entry.command` via the same fixed
  mapping the dispatcher uses (`claude→claude-code`, `codex→codex`,
  `copilot→copilot`, `gemini→gemini`, `antigravity→antigravity`,
  `opencode→opencode`, `cursor→cursor`). Entries whose command has
  no mapping SHALL be silently skipped (not an error — surfaces at
  dispatch time).
- Parse `entry.args` left-to-right: a token starting with `--`
  becomes a flag. If the next token exists AND does NOT start with
  `--`, it is the flag's value (pair); otherwise the flag is
  boolean (emitted as `<flag>: true`).
- Skip `--model` and its value entirely (the dispatcher CLI threads
  it per `Dispatch Slash Command`'s agmsg branch).
- Emit each type's section authoritatively — the sync REPLACES the
  full contents of that type's section. Flags previously present in
  `spawn_options.yaml` under a type ithyno now manages, but NOT in
  the current `entry.args`, SHALL be removed.
- Preserve type sections in `spawn_options.yaml` that do NOT appear
  in the current sync (e.g. a `codex:` section left over from a
  different tool). Only the ithyno-declared types are rewritten.
- Create `~/.agmsg/config/` when missing (`mkdir -p`) and use an
  atomic write (temp file + rename) for durability.
- Emit values matching agmsg's spawn-options YAML dialect exactly:
  a flat `<type>:` header followed by 2-space-indented
  `<flag>: <value>` lines; no nesting, no quoting.

The sync SHALL NOT display any UI notification or dialog — it is
silent auto-management.

#### Scenario: no agmsg block — sync is a no-op
- **GIVEN** `agents.yaml` has no top-level `agmsg:` block
- **WHEN** the server boots OR the UI saves the Agents Config
- **THEN** no read or write to `~/.agmsg/config/spawn_options.yaml` occurs

#### Scenario: live-shell worker → spawn_options.yaml populated
- **GIVEN** `agents.yaml` has `agmsg: { team: alpha }` AND a worker `{ name: claude, mode: live-shell, command: claude, args: [--dangerously-skip-permissions, --model, sonnet, --verbose, 2], roles: [code] }`
- **WHEN** the sync runs
- **THEN** `~/.agmsg/config/spawn_options.yaml` contains a `claude-code:` section with `--dangerously-skip-permissions: true` and `--verbose: 2`
- **AND** `--model` is NOT in `spawn_options.yaml`

#### Scenario: sync removes stale entries under a type ithyno manages
- **GIVEN** `spawn_options.yaml` currently has `claude-code:\n  --dangerously-skip-permissions: true\n  --old-flag: true`
- **AND** the current worker's `args` is `[--dangerously-skip-permissions]` only
- **WHEN** the sync runs
- **THEN** `spawn_options.yaml`'s `claude-code:` section contains only `--dangerously-skip-permissions: true` (the stale `--old-flag: true` is removed)

#### Scenario: sync preserves unrelated type sections
- **GIVEN** `spawn_options.yaml` currently has both `claude-code:` (managed by ithyno) and `grok-build:` (NOT declared in current `agents.yaml`)
- **WHEN** the sync runs against the current `agents.yaml`
- **THEN** only the `claude-code:` section is rewritten; `grok-build:` is left byte-identical

#### Scenario: manager entry is NOT synced
- **GIVEN** an entry `{ name: pptr, mode: live-shell, command: claude, roles: [manager] }`
- **WHEN** the sync runs
- **THEN** the manager entry contributes nothing to `spawn_options.yaml`; if only manager entries exist for the `claude-code` type, that section SHALL be removed rather than left empty

#### Scenario: unknown command silently skipped
- **GIVEN** a live-shell worker `{ command: my-wrapper, args: [--foo, true] }`
- **WHEN** the sync runs
- **THEN** no error, no escalation — the entry contributes nothing to `spawn_options.yaml` (dispatcher's agmsg branch would escalate at dispatch time on unknown command; the sync itself is silent)

#### Scenario: missing directory created on write
- **GIVEN** `~/.agmsg/config/` does NOT exist
- **WHEN** the sync runs and needs to write
- **THEN** `mkdir -p ~/.agmsg/config` is called first, then `spawn_options.yaml` is written atomically (temp file + rename)

#### Scenario: sync runs on server boot
- **GIVEN** `agents.yaml` has a valid `agmsg:` block and one or more live-shell workers
- **WHEN** the server starts and completes `registry.load()`
- **THEN** the sync runs once as part of the boot sequence, ensuring `spawn_options.yaml` matches `agents.yaml` before the first dispatch

#### Scenario: sync runs on POST /api/agents/config
- **GIVEN** the UI's Agents Config Modal writes a new agent entry via `POST /api/agents/config`
- **WHEN** the server completes `applyAgentConfigPayload` and reloads the registry
- **THEN** the sync runs immediately after, reflecting the just-saved args in `spawn_options.yaml`

#### Scenario: --model without a following token — sync treats it as boolean and skips
- **GIVEN** a worker entry whose `args` contains `--model` with no following token
- **WHEN** the sync runs
- **THEN** the sync does NOT emit `--model: true` (the flag and its intended value are the dispatcher's concern; the sync is inert for `--model` regardless of shape)
- **AND** the dispatcher will separately escalate on the bare `--model` per `Dispatch Slash Command`
