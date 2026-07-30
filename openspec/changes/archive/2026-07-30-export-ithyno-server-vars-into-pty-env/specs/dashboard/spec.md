## ADDED Requirements

### Requirement: Manager PTY exposes ithyno server contact vars

The Manager PTY (spawned by `server/sync/pty.ts:spawnLive`) SHALL export the following environment variables into the child shell, in addition to the existing shell environment inherited from `process.env`:

- `ITHYNO_SESSION_TOKEN` — the ithyno server's per-process session token. Required by every token-gated endpoint including `POST /api/manager/activity`. The PTY is local-only and already origin/token-gated at the WebSocket upgrade, so exporting the token into the shell environment adds no new exposure surface.
- `ITHYNO_PORT` — the port the ithyno server is listening on, as a bare decimal string (e.g. `"57703"`). Sourced from `process.env.PORT` (which the Electron shell and VSCode extension both set at server spawn time via `pickFreePort()`), with a fallback to `"4321"` for the CLI dev workflow where `PORT` is not set.
- `ITHYNO_BASE` — the ithyno server's base URL, as `http://localhost:<port>` (e.g. `"http://localhost:57703"`). Provided so consumers do not need to concatenate — the skill's `curl "$ITHYNO_BASE/api/..."` pattern must work verbatim.

These vars SHALL be set on every PTY spawn (`spawnLive`), NOT just at server startup — a project switch that respawns the PTY MUST re-export them with the current server's port so the fresh Manager reaches the fresh server.

Consumers (skills, tools, user commands run inside the PTY) MAY rely on `ITHYNO_BASE` being set. The `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi` skills SHALL NOT hardcode `http://localhost:4321` — hardcoded 4321 will connection-refuse under Electron and VSCode.

`TERM` SHALL be `xterm-256color` as it is today; no change to terminal capabilities.

#### Scenario: PTY spawned under Electron gets the ephemeral server port
- **GIVEN** the Electron shell spawns the ithyno server on port `57703` (chosen by `pickFreePort()`), then opens a PTY
- **WHEN** the child shell reads its environment
- **THEN** `ITHYNO_PORT == "57703"`
- **AND** `ITHYNO_BASE == "http://localhost:57703"`
- **AND** `ITHYNO_SESSION_TOKEN` matches the server's `SESSION_TOKEN`
- **AND** `curl "$ITHYNO_BASE/api/changes/<some-id>/phase"` returns 200 (not connection-refused)

#### Scenario: PTY spawned under the CLI dev workflow defaults to 4321
- **GIVEN** the server is launched by `npm run dev` with no explicit `PORT` env
- **WHEN** the PTY spawns
- **THEN** `ITHYNO_PORT == "4321"`
- **AND** `ITHYNO_BASE == "http://localhost:4321"`
- **AND** the previously-working dev workflow is unchanged

#### Scenario: Dispatch skill uses the exported base URL
- **GIVEN** the Manager PTY is running under Electron on ephemeral port `57703`
- **WHEN** `/ithy-opsx:dispatch <change-id>` invokes `curl "$ITHYNO_BASE/api/changes/<change-id>/phase"`
- **THEN** the request is routed to `http://localhost:57703/...` (the actual server)
- **AND** the response body is parsed successfully — no connection-refused, no fall-through to 4321

#### Scenario: PTY re-spawned on project switch gets the fresh port
- **GIVEN** ithyno is running at project A on port `57703`, and a `POST /api/project/switch` respawns onto project B on port `57811`
- **WHEN** the new PTY spawns
- **THEN** the fresh Manager's `ITHYNO_PORT == "57811"` (matches the new server, NOT the stale `57703`)
