---
tags: [phase-5, agents-yaml, area/server, area/web, breaking-change/backwards-compat]
---

# Collapse agent `shape` into `mode` + `roles[]`

## Why

Phase 3.1 introduced the split between the **Legacy shape** (`command + args + initialInput`) and the **Runtime-backed shape** (`runtime + prompt`). The Modal implementation in Phase 5.2 exposed two structural problems with that split:

1. **`shape` is not what the user is choosing.** The real behavioral fork is between "spawn, feed one prompt, exit" (headless Worker) and "spawn a PTY, keep it alive" (Manager). Both can be expressed in either shape today — the shape is just how you *declared* the config, not what the agent *does*. The `initialInput`-visible-in-Runtime-backed bug fixed in the previous turn was the direct symptom of that orthogonality.

2. **`role` as a scalar forces users to declare 3 agents for 1 CLI.** A user running Claude Code as their entire toolchain has to declare `claude-code`, `claude-review`, and `claude-verify` as separate entries — three near-duplicate blocks — because `role` is single-valued. Meanwhile the underlying CLI, args, and runtime are identical.

The right primitives are:

- **`mode`** — describes the spawn behavior: `single-prompt` (one-shot, headless) or `live-shell` (PTY, interactive).
- **`roles[]`** — the dispatch labels the agent can accept.
- **`prompts.<role>`** — per-role prompt override; defaults come from the runtime, then from a built-in `/opsx:<skill> ${change_id}` template.

The `runtimes:` section keeps its role as a **shared-defaults registry**: agents that reference `runtime: <name>` inherit `command`, `args`, `promptFlag`, and `prompts` from that runtime and can override any of them locally. Agents that specify `command` directly are still valid (no `runtimes:` entry required).

## What Changes

### `agents.yaml` schema

3. Every agent entry SHALL declare `mode: single-prompt | live-shell` (required, no default) and `roles: string[]` (required, non-empty). The former `role: string` field SHALL still be accepted as sugar for `roles: [<role>]` at load time.

4. The `shape: legacy | runtime-backed` distinction SHALL be removed. An agent MAY reference a `runtime: <name>` to inherit shared defaults; whether it also specifies `command` locally is orthogonal.

5. `prompts:` on both runtimes and agents SHALL be a map from role name to prompt template string. Resolution order at dispatch time: `agent.prompts[role]` → `runtimes[agent.runtime].prompts[role]` → built-in default `/opsx:<skill> ${change_id}` (where `<skill>` = `apply` for `code`, `review` for `review`, `verify` for `verify`, `manage` for `manager`).

6. The legacy `initialInput` field SHALL be removed from the agent schema. During load-time normalization, an entry that specifies `initialInput` SHALL be interpreted as `prompts.<role>: <value>` for its single role. Multi-role agents cannot use `initialInput`.

### Backward compatibility

7. Existing `agents.yaml` files with `role: string`, `command + args + initialInput`, or `runtime + prompt` SHALL continue to load and spawn identically. The loader SHALL normalize old-shape entries into the new schema at parse time. Users SHALL NOT be required to migrate their `agents.yaml` on this release.

8. A load-time warning SHALL surface for entries that use the deprecated `initialInput`, `role: string`, or bare `runtime + prompt` shapes, pointing at this change's outcome as the migration guide.

### Dispatch selector

9. The selector SHALL match `request.role` against each agent's `roles` array (contains-check) instead of the scalar `role` field. All other selection logic (specialties intersection, runtime filter, declaration-order tiebreak) SHALL remain unchanged.

10. Job records SHALL continue to carry a **scalar** `role` field (the specific role that was dispatched), not the agent's whole `roles` array. This preserves per-job traceability.

### Modal (Agents tab config UI)

11. The Modal SHALL replace the `shape` toggle with a `mode` toggle (`single-prompt | live-shell`). The `runtime` dropdown SHALL become an optional field ("Inherit from runtime — none"); when set, the Modal SHALL show inherited-default hints inline next to `command`, `args`, and `prompts.<role>` inputs.

12. The `role` dropdown SHALL become a **multi-select** for `roles`. The Manager singleton constraint SHALL still hold: only one agent may have `manager` in `roles`.

13. The `initialInput` field SHALL be removed. Instead, the Modal SHALL render a per-role prompt textarea for each role in `roles` (labeled "Prompt for role: `<role>`"), with the resolution-order chain shown below each field.

### Preset table

14. `add-modal-command-picker-and-presets` SHALL be reshaped: presets become per-CLI defaults that populate `command`, `args`, and `prompts` (for known roles) on a fresh agent. The preset table gains no per-role variants — one preset per CLI covers all roles by populating the `prompts` map.

### Spec deltas

15. **MODIFIED**: `Runtime Definitions In agents.yaml` — adds `prompts:` field.
16. **MODIFIED**: `Runtime-Backed Agents` — folds into the unified schema; removes shape-exclusivity clause.
17. **MODIFIED**: `Backward Compatibility With Command-Based Agents` — extends the guarantee to the new `mode + roles` shape.
18. **MODIFIED**: `Role-Based Agent Dispatch API` — `role` request-field still scalar; agent selection now consults `roles[]`.
19. **MODIFIED**: `Agent Selection By Role And Specialties` — matches `request.role` against `agent.roles[]`.
20. **MODIFIED**: `Job Model Includes Role And Runtime` — job `role` is scalar (dispatched role); no longer implies agent has a single role.
21. **ADDED**: `Agent Mode Field`.
22. **ADDED**: `Agent Roles Array`.
23. **ADDED**: `Per-Role Prompt Resolution`.

## Impact

- **Breaks nothing** at runtime: the loader normalizes old shapes into the new schema. Existing `agents.yaml` files continue to work.
- **Blocks `add-modal-command-picker-and-presets`**: that change's preset design assumed Legacy shape. It SHALL be reshaped (or landed after this change) so its presets populate the new fields.
- **Simplifies Modal state**: `AgentConfigModal.tsx` state shape shrinks — no more `shape` toggle, no more `initialInput` field, `role` → `roles[]` multi-select. The `form.shape === "legacy"` conditional branches disappear.
- **`refine-agents-config-modal` verify items partially obsoleted**: the tightening around `shape=legacy` for Manager becomes "mode=live-shell for Manager" instead.

## Out of scope

- **Removing the `runtimes:` section entirely.** It stays as a shared-defaults registry. Deleting it later is a separate discussion.
- **New template variables in prompts.** The set stays at `${change_id}`, `${worktree_path}`, `${branch}`. Adding more (`${role}`, `${agent_name}`, ...) is a follow-up idea.
- **Enforcing single-role for `manager`.** The Manager singleton constraint is unchanged (Modal keeps it); this proposal doesn't tighten the rule further (e.g., "manager MUST be the only role").
- **Per-agent PTY-startup extras** (env vars, cwd overrides). Same restrictions as today.
- **Migration script** that rewrites the user's `agents.yaml` into the new shape. Users can opt in by editing manually; automated migration is a plausible follow-up but not required to land.
