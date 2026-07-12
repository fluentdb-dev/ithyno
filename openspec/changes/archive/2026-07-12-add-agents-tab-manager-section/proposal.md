---
tags: [phase-5, agents-tab, manager, area/server, area/web]
---

# Add Manager section to the Agents tab (always shows what's actually running)

## Why

Right now the Manager PTY (the embedded Terminal panel's
`claude --continue` or user-configured startup) is invisible on the
Agents tab. The Live section only shows worker jobs from the
`AgentRunner`; the Configured (idle) section only shows entries
from `agents.yaml`. So the Manager — the runtime that gives the
whole change lifecycle its interactive brain — falls between the
cracks:

- If `agents.yaml` has no `role: manager` entry, the fallback chain
  in `ptyStartup()` still spawns `claude --continue` (or the env
  var override). The user sees it in the Terminal panel, but the
  Agents tab pretends it's not there.
- If `agents.yaml` DOES have a manager entry, it shows up as just
  another row in Configured (idle), lost among workers.

The tab should be honest about what's actually running: "if it's
alive, it's visible."

## What Changes

### Server

1. **`server/index.ts`** — new `GET /api/manager/status`:
   ```
   {
     "agentEntry": AgentPublic | null,
     "resolvedStartup": string | null,
     "initialInput": string | null,
     "fallbackSource": "declared" | "env" | "default",
     "terminalActive": boolean
   }
   ```
   - `agentEntry`: the `role: manager` entry from the registry
     (null when none declared)
   - `resolvedStartup`: the string that would be typed into a fresh
     PTY (from `ptyStartup()` — includes the fallback chain)
   - `initialInput`: the auto-inject line (from the same
     resolution) or null
   - `fallbackSource`: which stage of the chain won —
     `"declared"` (agentEntry present), `"env"`
     (`ITHYNO_TERMINAL_STARTUP` set), or `"default"` (hardcoded)
   - `terminalActive`: whether at least one PTY session is
     currently open (from `activeTerminalCount() > 0`)

2. **`server/sync/pty.ts`** — no behavior change; expose the
   existing `activeTerminalCount()` (already public) and let
   `ptyStartup()` be called from the endpoint.

### Client

3. **`web/src/types.ts`** — new `ManagerStatus` type mirroring the
   endpoint response.

4. **`web/src/api.ts`** — `fetchManagerStatus()`.

5. **`web/src/store.ts`** — `managerStatus: ManagerStatus | null`
   state + `loadManagerStatus()` action.

6. **`web/src/pages/Agents.tsx`** — insert a new `ManagerSection`
   between the Runtimes and Live sections. Renders one of three
   states:
   - **Declared** — the agentEntry as a row with `Edit`
     button; `MANAGER` badge; no Delete (already enforced by
     Phase 5). Show the resolvedStartup as `command args…` and the
     `initialInput` inline.
   - **Fallback** — `agentEntry === null` AND
     `terminalActive === true`. Show a muted card:
     `Manager (fallback): claude --continue` +
     `Source: hardcoded default (or environment variable
     ITHYNO_TERMINAL_STARTUP)`. A `[Declare in agents.yaml]` button
     opens the AgentConfigModal in Add mode with `role: manager`
     preselected.
   - **Idle** — `agentEntry === null` AND
     `terminalActive === false`. Show an empty state: `No manager
     declared; open a change to launch the Terminal panel and the
     hardcoded fallback will start.` No CTA button.

7. **`web/src/pages/Agents.tsx`** — since the Manager now has its
   own section, remove it from the Configured (idle) list (filter
   out `role: manager` entries from `idleAgents`).

### Spec

8. **ADDED**: `Manager Status Endpoint`.
9. **ADDED**: `Agents Tab Manager Section`.

## Impact

- **Existing users, no manager entry declared, terminal open**:
  will now see a muted "Manager (fallback): claude --continue" card
  instead of nothing. Directly answers the user's question ("what's
  actually running").
- **Existing users, manager entry declared**: the entry moves from
  Configured (idle) into a dedicated Manager section (still
  editable, still no Delete).
- **`+ Add agent` flow unchanged** — the modal still handles
  Manager creation as before. The new `[Declare in agents.yaml]`
  button on the fallback card is just a shortcut with role
  preselected.
- **Files added / changed**: `server/index.ts` (endpoint),
  `web/src/pages/Agents.tsx` (new section + filter), `types.ts` +
  `api.ts` + `store.ts` for the new state.

## Out of scope

- **Editing the Terminal panel's live PTY from the section**
  (e.g., "restart with new command"). The Terminal panel already
  has its own restart-on-close flow; adding a control here would
  be redundant.
- **Multi-manager display**. Manager is a singleton
  (refine-agents-config-modal); only one entry can be declared.
- **Attaching to the fallback PTY as if it were a declared
  Manager**. The fallback is transient — it's meant as a nudge to
  declare, not a persistent identity.
