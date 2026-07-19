---
tags: [feature/revert, area/web, area/dashboard, add-agents-config-ui]
---

# Revert add-agents-config-ui (Case β)

## Why

`add-agents-config-ui` (in-flight, Phase 5.2) proposed 3 ADDED
requirements against the `dashboard` capability:

1. **`Agents Config Edit Modal`** — the AgentConfigModal component
   with name / role dropdown / shape toggle (legacy vs runtime-
   backed) / runtime dropdown / command + args / prompt / specialties
   / concurrency / dedicated fields.

2. **`Agents Config Delete Confirmation`** — an inline
   DeleteConfirmDialog on the Agents tab that gates row deletion
   behind a "Delete agent `<name>`?" prompt.

3. **`Agents Config Add Button`** — the `[+ Add agent]` button
   below the Configured (idle) section that opens the modal in Add
   mode.

The intent survives, but `reshape-agents-yaml-mode-roles`
(archived 2026-07-14) rebuilt the Modal to reshape's `mode` /
`roles` shape and folded most of the field-level details into a
new authoritative requirement:

- **`Agents Config Modal Layout Ergonomics`**
  (`openspec/specs/dashboard/spec.md` line 1291) — covers auto-
  generated name, per-role field visibility, Advanced options
  disclosure, scroll behavior, Manager-specific field hiding, etc.
- **`Agents Config Live Updates`** (line 1426) — covers the file-
  watcher broadcast that keeps the Modal in sync with
  `agents.yaml`.
- **`Manager Agent Server-Side Singleton Guard`** (line 3029,
  added 2026-07-19 via `revert-refine-agents-config-modal`) —
  covers the manager singleton API guards.
- **`Manager Agent Listed With Other Agents`** (line 1485) —
  covers the Manager row's Delete button suppression.

Six tasks in `add-agents-config-ui/tasks.md` are already marked
`[~]` (obsoleted by reshape): the `name` disabled input, initial
input field, runtime dropdown, Concurrency / Specialties detail,
etc. The `Agents Config Edit Modal` requirement as written is
substantially superseded by `Agents Config Modal Layout Ergonomics`.

What remains **NOT covered** by any current spec:

- **The Delete Confirmation dialog** — no current requirement
  spells out that clicking Delete on a row surfaces a "Delete
  agent `<name>`?" confirmation before the destructive request
  fires.
- **The `[+ Add agent]` button's existence** below the Configured
  (idle) section — no current requirement mandates this entry
  point.

Both are small, still-implemented behaviors that would leave a
spec gap if we simply retired `add-agents-config-ui` without
adding anything.

Retire wholesale via Case β following the same pattern as today's
three earlier reverts (`revert-refine-agents-config-modal`,
`revert-add-manager-agent-config`, `revert-add-agent-initial-
input`), and add ONE small ADDED requirement covering the two
uncovered bits.

The **implementation code stays** — every field, button, and
dialog described by `add-agents-config-ui` continues to exist
(subject to reshape's modifications).

## Targets

All Case β.

1. **`add-agents-config-ui`** (in-flight, Case β): retire the
   entire in-flight delta. 6 tasks are already obsolete-tagged;
   Modal-internal requirements are covered by
   `Agents Config Modal Layout Ergonomics`; only the Delete
   Confirmation dialog and `[+ Add agent]` button existence are
   spec gaps, filled by the revert's ADDED requirement.

## What Changes

### Spec (ADDED — 1 requirement)

- `dashboard`: **ADDED**
  `Agents Config Delete Confirmation And Add Button` — combines
  the two remaining gaps.

### Impl

- **No code changes.** `Agents.tsx` still renders the
  `DeleteConfirmDialog` and the `[+ Add agent]` button;
  `AgentConfigModal.tsx` still opens on Add / Edit clicks. No
  test changes.

## Case β revert validity

`add-agents-config-ui` is in-flight (its 3 ADDED requirements
never reached `openspec/specs/dashboard/spec.md`). Most of the
delta is superseded by `Agents Config Modal Layout Ergonomics`
and its siblings; the two uncovered bits (Delete Confirmation,
Add Button) are captured by the revert's small ADDED requirement.
Retiring wholesale via Case β does not remove any currently-
authoritative statement.

## Blast radius

- `openspec/changes/add-agents-config-ui/` moves to
  `openspec/changes/archive/2026-07-19-add-agents-config-ui/`
  after its `specs/` is deleted.
- `openspec/specs/dashboard/spec.md` gains one small ADDED
  requirement covering the confirmation dialog + Add button.
- No code changes; no user-facing UI changes; no test changes.

## Out of scope

- **Consolidating the "Agents Config" spec cluster** (Modal
  Layout Ergonomics + Live Updates + this revert's small addition
  + Manager Singleton Guard) into a single canonical `dashboard`
  section — leave to a future refactor.
- **Modal-internal field-level scenarios** — covered by
  `Agents Config Modal Layout Ergonomics`; not repeated here.
