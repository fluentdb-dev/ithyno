---
tags: [phase-5, agents-tab, ui, config, area/web]
---

# Add agents.yaml edit UI to the Agents tab

## Why

Phase 5.1 (`add-agents-tab-live-panel`) landed a 4-section
read-only Agents tab (Runtimes / Live / Configured (idle) / Recent
jobs). The next capability the tab needs is **write** —
`agents.yaml` is where users configure agents' role, runtime,
prompt template, specialties, concurrency, and dedicated / pool
mode. Today the only way to change any of these is to hand-edit
the file in a text editor, restart the dev server, and hope the
YAML shape matches what the parser expects.

An in-tab editor gets users out of raw YAML for the common cases
(add / edit / delete an agent) while keeping the file as the
source of truth on disk. The server-side write endpoint lands in
5.3 (`add-agents-config-write`); this change lands the client UI
and wires it to that (as-yet-unimplemented) endpoint. Until 5.3
lands, Save / Delete surface a friendly "not implemented" toast
rather than silently no-op.

## What Changes

### UI additions (Configured (idle) section only)

1. **Edit button** on each row → modal with fields:
   - name (kebab-case, disabled when editing existing)
   - role (dropdown: code / review / verify / manager / other)
   - shape toggle: **legacy** (`command` + `args[]`) vs
     **runtime-backed** (`runtime` + `prompt`)
   - runtime dropdown (from `/api/agents/runtimes`, populated when
     runtime-backed shape is selected)
   - command + args inputs (populated when legacy shape is
     selected)
   - prompt (multi-line text)
   - specialties (comma-separated tags)
   - concurrency (number input, min 1)
   - dedicated (checkbox — pool mode when unchecked)
2. **Delete button** on each row → confirmation dialog
   ("Delete agent `<name>`? This removes it from agents.yaml.")
3. **+ Add agent** button below the section → same modal as
   Edit but with empty fields and shape toggle default legacy

### Client wiring

- New API client method `saveAgentConfig(next: AgentConfig)` in
  `web/src/api.ts` — POSTs to `/api/agents/config` (5.3
  endpoint). Until 5.3 lands, the endpoint 404s; the client shows
  an error toast with a hint about Phase 5.3.
- No new store slice — reuse existing `agents` state; refresh on
  successful save via `loadAgents()`.

### Spec

3 ADDED requirements in `dashboard` capability:

- `Agents Config Edit Modal` — the shape / fields of the modal
- `Agents Config Delete Confirmation`
- `Agents Config Add Button`

## Impact

- **Files added/changed**: `web/src/pages/Agents.tsx` (adds
  buttons + modal integration); new `web/src/components/AgentConfigModal.tsx`;
  `web/src/api.ts` gets `saveAgentConfig()`.
- **Server**: nothing here. Phase 5.3 adds the endpoint.
- **Blast radius**: purely additive on the Configured (idle)
  section. Live / Runtimes / Recent jobs untouched. If the user
  never touches Edit / Delete / + Add, the tab renders exactly as
  Phase 5.1 left it.
- **Tests**: modal render + form validation covered as a unit
  test where feasible; end-to-end save exercised in Phase 5.3.

## Out of scope

- **Server-side write** (`POST /api/agents/config`) — Phase 5.3.
- **Runtimes editor** — this tab edits agents only. Runtimes are
  declared under the top-level `runtimes:` key and stay
  hand-edited for now.
- **Bulk operations** (reorder, duplicate). One agent at a time.
- **Live validation of the resulting YAML** — the write endpoint
  in 5.3 owns the schema check; the modal enforces per-field
  shape only.
