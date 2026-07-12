---
tags: [phase-5, agents-tab, manager, config, area/web, area/server]
---

# Refine the Agents config modal (initialInput + Manager singleton + no Manager delete)

## Why

Three UX / correctness gaps surfaced during the manual verification of
`add-manager-agent-config` (2026-07-12):

1. **`initialInput` is missing from the Modal.** The field is used by
   both worker agents (`initialInput: "/ithy-opsx:apply ${change_id}"`)
   and the Manager (`initialInput: "/opsx:manage"`). Phase 5.2 landed
   the Modal without it, so users can't set the auto-inject line from
   the UI — they have to hand-edit `agents.yaml`.

2. **Manager should be a singleton, not "the first of many".** The
   Manager is the interactive PTY that owns the Terminal panel. Having
   multiple Manager entries is semantically ambiguous (which one runs?
   Silent order-dependence). One Manager (or none, falling back to the
   env var / default) is the right cardinality.

3. **The Manager row's Delete button is a footgun.** Deleting the
   only Manager silently disables the Terminal panel's auto-launch —
   the panel falls back to the env var / hardcoded default, which may
   not match what the user expected. The Manager row should not have a
   Delete button; users can Edit-only or reset via file edit.

## What Changes

### Modal (client)

1. **`web/src/components/AgentConfigModal.tsx`** — add an
   `initialInput` textarea (single-line, resizable) below the
   shape-specific fields. Placeholder shifts by role:
   `manager` → `"/opsx:manage"`, `code` → `"/ithy-opsx:apply ${change_id}"`,
   others → generic hint.

2. **Modal role-dropdown becomes context-aware.** When the modal is
   opened in Add mode AND at least one manager entry already exists,
   `manager` is removed from the `ROLE_OPTIONS` list rendered inside
   the modal. Edit mode leaves the role editable (a user Editing the
   sole manager keeps the option).

3. **Modal shape enforcement for manager**: when `role === "manager"`,
   the shape radio auto-forces `"legacy"` and disables the
   `"runtime"` radio with a hint ("runtime-backed managers are not
   yet supported"). Matches the loader-side rejection landed by
   `add-manager-agent-config`.

### Agents tab (client)

4. **`web/src/pages/Agents.tsx`** — the `AgentRow` component hides
   its `Delete` button when `agent.role === "manager"`. `Edit` stays
   visible.

### Server

5. **`server/agents/registry.ts`** — `validateAgents` rejects the
   presence of a second `role: manager` entry (currently accepts
   "many, uses the first").

6. **`server/agents/config-writer.ts`** — `applyAgentConfigPayload`:
   - On `action: "delete"` for a manager-role entry, returns
     `{ ok: false, status: 400, error: "manager agents cannot be
     deleted from the UI; edit agents.yaml directly to remove" }`.
   - On `action: "upsert"` that would create a second manager entry
     (i.e., there's already a manager entry with a different name),
     returns `{ ok: false, status: 400, error: "only one role:
     manager entry is allowed" }`. Editing the existing manager
     (same name) is fine.

### Spec

7. **MODIFIED**: `Manager Role In agents.yaml` — change "zero, one, or
   many" to "zero or one" and drop the "first entry wins" language.
8. **ADDED**: `Agents Config Modal Includes InitialInput Field`.
9. **ADDED**: `Agents Config Manager Delete Rejected`.
10. **ADDED**: `Manager Singleton Enforcement`.

Per the CLAUDE.md In-flight spec 注記 rule, this change adds a
`PENDING MODIFICATION` blockquote to the current `Manager Role In
agents.yaml` requirement.

## Impact

- **Existing users with 1 or 0 manager entries**: no change in
  behavior — validator accepts them as before.
- **Existing users with 2+ manager entries**: load will now error out
  cleanly, with a message pointing at the second entry. The
  `add-manager-agent-config` outcome said the "first wins" behavior
  was documented as an implicit precedence — we're tightening it.
- **Modal users**: gain the `initialInput` field. The `+ Add agent`
  dropdown may drop `manager` if one already exists — the tab still
  shows the existing manager row for editing.
- **Files changed**: 4 (2 client, 2 server) + 1 test file per module.

## Out of scope

- **Automatic migration** for users who have 2+ manager entries. The
  load-time error tells them what to fix; a UI-side "consolidate my
  managers" flow is nice-to-have but not blocking.
- **Delete-manager path via a hidden admin flag**. If a user really
  wants to remove the manager they can hand-edit `agents.yaml`; the
  UI staying strict is worth the small friction.
- **Runtime-backed Manager**. Still blocked at load; this change
  just surfaces the block earlier (in the modal) instead of only
  at Save time.
