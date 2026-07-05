---
tags: [feature/agents, area/server]
---

## Why

Later phases introduce a dispatcher that routes jobs to agents by role and
specialty and caps per-agent parallelism. None of that can be built — or
even authored in a user's `agents.yaml` ahead of time — until the registry
schema accepts the fields. This change lands the schema plumbing only: the
loader accepts and validates `role`, `specialties`, and `concurrency`,
defaults them for legacy files, and exposes them on `AgentDef`. Nothing
consumes them yet; observable runner behavior is unchanged. Landing the
schema first lets the dispatcher proposal (a later phase) be reviewed
against a settled data shape instead of negotiating both at once.

The original idea note framed this as a backwards-incompatible migration.
We deliberately soften that: all three fields are optional with defaults,
so every existing `agents.yaml` keeps loading and running exactly as
before.

**Sequencing note**: this change is Phase 1 of the multi-agent redesign
sketched in `docs/ideas/2026-07-04-agent-roles-and-worktree-pool.md`. It
ships alongside `add-worktree-pool`. Both touch `server/agents/registry.ts`
and `templates/agents.yaml.example`, so they cannot be implemented in
parallel worktrees — implement `add-agent-role-field` first, then rebase
`add-worktree-pool` onto the merged result.

## What Changes

### Server: schema extension

- `server/agents/registry.ts::AgentDef` gains three optional fields:
  - `role?: string` — defaulted to `"coder"`. Open set (no enum check);
    roles are free-form strings so later phases can add `reviewer`,
    `proposer`, etc. without a schema change here.
  - `specialties?: string[]` — defaulted to `[]`. Tag prefixes per the
    tag taxonomy (`area/*` is the routing-relevant namespace); empty
    means "accepts any tag". Phase 1 validates only that each entry is a
    non-empty string — prefix-format enforcement waits for the dispatcher
    that consumes them.
  - `concurrency?: number` — defaulted to `1`. Must be an integer ≥ 1.
    **Not enforced in Phase 1** — declared capacity, recorded for the
    dispatcher.

### Server: validation

- `validateAgents()` rejects, with a field-and-agent-naming error message:
  non-string `role`, empty-string `role`, non-array or non-string-element
  `specialties`, and non-integer or `< 1` `concurrency`.
- Defaults are applied after validation so downstream code never sees
  `undefined` for these three fields.

### Template

- `templates/agents.yaml.example` gains a commented block documenting the
  three new fields with the defaults spelled out. This file is the only
  discovery surface shipped into user projects, so leaving it stale would
  make the fields effectively secret until later.

## Capabilities

### Modified Capabilities

- `agent-runner`: the registry schema accepts role/specialty/concurrency
  metadata with non-breaking defaults; the runner treats it as inert.

## Impact

- `server/agents/registry.ts` — `AgentDef` type + `validateAgents()` rules
  + default application
- `templates/agents.yaml.example` — commented documentation of the new
  fields
- `server/agents/registry.test.ts` (NEW file — the existing
  `registry-initial-input.test.ts` covers only the older `initialInput`
  path and stays untouched) — validation and defaulting cases, plus a
  legacy-file regression test

## Out of scope

- **Any consumer of the fields.** No routing, no role filtering, no
  concurrency enforcement. The runner's single-agent path is untouched.
- **Dispatcher component** — later phase.
- **`knowledgeFile` field** — deferred to a future
  `add-agent-knowledge-file` change per the idea note.
- **Specialty prefix/format validation** (e.g. requiring `namespace/name`
  shape) — deferred until routing gives the format teeth.
- **UI surfacing** of role / specialties (roster panel, swim lanes) —
  later phase; no `dashboard` capability delta here.
