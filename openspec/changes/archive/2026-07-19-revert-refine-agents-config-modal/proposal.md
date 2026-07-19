---
tags: [feature/revert, area/dashboard, refine-agents-config-modal]
---

# Revert refine-agents-config-modal (Case β)

## Why

`refine-agents-config-modal` (in-flight) proposed a delta against the
`dashboard` capability with:

- 1 **MODIFIED** requirement — `Manager Role In agents.yaml` (originally
  added by `add-manager-agent-config`)
- 3 **ADDED** requirements — `Agents Config Modal Includes InitialInput
  Field`, `Agents Config Manager Delete Rejected`, `Manager Singleton
  Enforcement`

Two subsequent changes have made most of this delta obsolete or
un-applicable:

1. **`add-manager-agent-config`** was reverted by
   `2026-07-15-revert-manager-agent-config` (archived). The revert
   replaced `Manager Role In agents.yaml` with `Manager Agent Listed
   With Other Agents`. refine's `MODIFIED Requirement: Manager Role In
   agents.yaml` targets a heading that no longer exists in
   `openspec/specs/dashboard/spec.md`, so `openspec archive
   refine-agents-config-modal` fails: `dashboard MODIFIED failed for
   header "### Requirement: Manager Role In agents.yaml" - not found`.

2. **`reshape-agents-yaml-mode-roles`** (archived `2026-07-14`)
   reshaped the schema from `role:` to `roles:` and folded
   `initialInput:` into per-role `prompts:` textareas. Two of refine's
   ADDED requirements — the InitialInput field and the "manager-role
   disables runtime radio" scenario — no longer describe the shipped
   UI:

   - `initialInput` textarea → replaced by per-role `prompts:` textareas
     with resolution-chain hints.
   - Role dropdown with runtime radio → replaced by chip multi-select
     (`roles: [...]`) with the shape radio removed entirely; manager is
     locked to `mode: live-shell`.

What actually stands as of today:

- **Manager Delete Rejected** — implemented and verified
  (`config-writer` returns 400 on delete of a manager entry, Modal
  hides the Delete button). Curl-tested 2026-07-19.
- **Manager Singleton Enforcement (server API guard portion)** —
  implemented and verified (`config-writer` returns 400 on upsert
  creating a second manager). Curl-tested 2026-07-19.
- **Manager Singleton Enforcement (UI-level dropdown filter)** —
  obsolete: the reshape replaced the role dropdown with a chip
  multi-select, and `revert-manager-agent-config` removed the dedicated
  Manager section, so the "`+ Add agent` never offers manager" rule no
  longer applies as originally described. Chip multi-select still
  respects singleton at the server layer.

Rather than rewrite refine's delta to match today's spec (which would
be substantially rewriting three requirements to their post-reshape
form and dropping the MODIFIED entirely), we retire refine wholesale
via a Case β revert:

- refine's `specs/` is deleted so `openspec archive` doesn't apply its
  stale delta to `dashboard`.
- refine's `outcome.md` is rewritten to point at this revert.
- refine is archived as `2026-07-19-refine-agents-config-modal`
  (immediately followed by this revert).

The **implementation code stays** — the server-side manager guards
verified today remain the current behavior. Only the openspec spec
delta is retired. The current authoritative dashboard spec (with
`Manager Agent Listed With Other Agents` from
`revert-manager-agent-config`) is unchanged.

## Targets

All Case β.

1. **`refine-agents-config-modal`** (in-flight, Case β): retire the
   entire in-flight delta. Its 1 MODIFIED requirement is unrooted; 2 of
   its 3 ADDED requirements are obsoleted by
   `reshape-agents-yaml-mode-roles` and
   `revert-manager-agent-config`. The 1 remaining
   ADDED-requirement-worth of behavior (server-side manager delete +
   singleton API guards) is already described operationally by the
   codebase and tests; recording it as a spec delta at this late stage
   would require a fresh propose against the current spec headings.

## What Changes

### Spec (ADDED — 1 requirement)

Post-revert baseline for the `dashboard` capability: leave the
existing `Manager Agent Listed With Other Agents` requirement (added
by `revert-manager-agent-config`) as the authoritative statement of
manager UI/API behavior. This revert adds one clarifying
requirement that captures what refine's guard code actually
enforces today, without contradicting the current spec.

- `dashboard`: **ADDED** `Manager Agent Server-Side Singleton Guard`

### Impl

- **No code changes.** The server-side guards in
  `server/agents/config-writer.ts` and `server/agents/registry.ts`
  that refine landed remain in effect. Verified 2026-07-19 via curl
  against `POST /api/agents/config` — both the delete-manager and
  create-second-manager paths return 400 with the documented error
  messages, and `agents.yaml` is unchanged.

## Case β revert validity

refine-agents-config-modal is in-flight (never applied to
`openspec/specs/dashboard/spec.md`). Its MODIFIED target no longer
exists in the current spec because `revert-manager-agent-config`
already replaced it. Retiring refine wholesale via Case β does not
alter the current authoritative spec — the code path refine landed is
independently described by the ADDED requirement below. No spec
divergence results.

## Blast radius

- `openspec/changes/refine-agents-config-modal/` moves to
  `openspec/changes/archive/2026-07-19-refine-agents-config-modal/`
  after its `specs/` is deleted (so `openspec archive` applies no
  delta).
- `openspec/specs/dashboard/spec.md` gains one ADDED requirement
  describing the server-side singleton guard the code enforces. No
  MODIFIED / REMOVED touches the existing landed spec.
- No code changes; no user-facing UI changes; no test changes.

## Out of scope

- **Post-reshape UI-level singleton rules** (chip multi-select
  behavior around manager) — currently unspecified; leave for a
  future refine-<scope> change.
- **Per-role prompts field spec coverage** — separately handled by
  `reshape-agents-yaml-mode-roles`.
