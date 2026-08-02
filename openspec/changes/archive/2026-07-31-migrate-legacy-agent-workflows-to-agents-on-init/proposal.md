---
tags: [skills, migration, agy, antigravity, init, cross-cli]
execution: worktree
---

## Why

agy's current convention reads `.agents/workflows/*.md`. openspec's
own antigravity adapter (as of the 0.x install in `node_modules/@fission-ai/
openspec/dist/core/command-generation/adapters/antigravity.js`) still
writes to the legacy `.agent/workflows/opsx-<id>.md`. Consequence: any
project scaffolded by `openspec init --tools antigravity` gets
`opsx-propose.md`, `opsx-apply.md`, and friends dropped under
`.agent/workflows/` — but agy never discovers them.

The bug fix commit `d363764` corrected openspec-ui's own antigravity
renderer to emit at `.agents/workflows/`. That covers `ithy-opsx-*`
skills (the ones the renderer owns). It does NOT fix the openspec-owned
`opsx-*` files sitting in the wrong dir — that's out-of-repo output
we shouldn't overwrite by accident.

This change adds a one-shot **legacy-agent-dir migration** step to
init: when the antigravity renderer is invoked and `.agent/workflows/`
exists on disk, move its contents into `.agents/workflows/` (skipping
files already present at the target). Once migrated, delete the empty
`.agent/workflows/` and its parent `.agent/` if empty.

This is spec-level because init now mutates files that another tool
(openspec CLI) wrote — new observable behavior beyond "write my own
output".

## What Changes

1. **New helper** in `server/skill-renderer/index.ts` (or a small
   sibling file):
   `migrateLegacyAntigravityDir(projectRoot: string): Promise<{ moved: string[], skipped: string[] }>`.
   Runs when the antigravity renderer is selected. Idempotent — a
   second run finds nothing to migrate and is a no-op.

2. **installSkills wire-up**: when `selectedClis` includes
   `antigravity`, invoke the migration ONCE (not per skill) before the
   render loop. Add its result to `InstallResult` as a top-level
   `migrations: [{ cli: "antigravity", moved: [...], skipped: [...] }]`
   field — surfaced but not fatal.

3. **Conflict resolution**: if a file with the same basename already
   exists at `.agents/workflows/`, the migration SHALL leave the
   legacy file in place and report it under `skipped[]` with reason
   `"target exists"`. The renderer's own subsequent write at
   `.agents/workflows/<same-name>` remains authoritative — no legacy
   copy is silently promoted over renderer output.

4. **Dry-run parity**: when `installSkills` is invoked with
   `dryRun: true`, the migration also runs in dry-mode — reports
   what would be moved without touching disk.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `cross-cli-skill-installer`: extend the antigravity renderer
  behavior with a legacy `.agent/workflows/` → `.agents/workflows/`
  migration step invoked once per install. Adds one scenario under
  the existing "openspec init invokes per-CLI renderers" requirement
  covering the migration path.

## Impact

- `server/skill-renderer/index.ts` — add `migrations: [...]` to
  `InstallResult`, invoke the migration helper for antigravity.
- `server/skill-renderer/migrate-agy.ts` (new) — the helper.
- `server/skill-renderer/types.ts` — extend `InstallResult` type.
- `server/skill-renderer.test.ts` — new tests: (a) migration moves
  files, (b) migration skips conflicts, (c) migration is idempotent,
  (d) migration is a no-op when `.agent/` doesn't exist, (e)
  dry-run reports plan without side effects.
- No renderer file changes — the migration is a pre-render step, not
  a renderer method.
- test-proj2 (agy Manager) — user's next `openspec init` re-run there
  will migrate its stale `.agent/workflows/opsx-*.md` into
  `.agents/workflows/`, unblocking discovery of both `opsx-*` and
  `ithy-opsx-*` skills at the same time.
