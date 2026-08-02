---
tags: [skills, migration, agy, antigravity, init, cross-cli, claude-legacy]
execution: worktree
---

## Why

Projects scaffolded before the per-CLI renderer landed have their
`ithy-opsx-*` commands hand-authored under `.claude/commands/ithy-opsx/`
(because the old init flow was a blind `.claude/` template copy).
For projects whose Manager is agy, those files are **invisible** —
agy reads `.agents/workflows/`, not `.claude/`, so `/ithy-opsx:dispatch`
and friends are not discoverable.

The prior change (`migrate-legacy-agent-workflows-to-agents-on-init`)
handles openspec-owned `opsx-*` files at `.agent/workflows/`. This
change handles the complementary case: ithyno-ui-owned `ithy-opsx-*`
files under `.claude/commands/ithy-opsx/`.

User feedback (2026-07-31, follow-up in the migrate change's outcome):
> `.claude/commands/` 配下にある ithy-opsx ディレクトリを、
> Antigravity 用のディレクトリである `.agents/workflows/` の中に
> **コピー・配置** する必要があります。

Two things are decided by this feedback:
1. **Destination shape**: `.agents/workflows/ithy-opsx/<cmd>.md`
   (nested — makes `/ithy-opsx:<cmd>` per agy's colon-form path
   convention that landed in the previous renderer fix).
2. **Semantics**: **COPY, not move**. The user explicitly said
   コピー ("copy"). This preserves `.claude/` intact for Claude
   users and for any project that mixes both CLIs during transition.

## What Changes

1. **New helper** `copyClaudeIthyOpsxCommandsToAgents(projectRoot, opts)`
   in `server/skill-renderer/migrate-agy.ts` (co-located with the
   existing legacy-dir migration — both are agy-specific rescue
   operations):
   - Reads `<projectRoot>/.claude/commands/ithy-opsx/*.md`.
   - For each file, if `<projectRoot>/.agents/workflows/ithy-opsx/<same-basename>`
     does NOT exist, copy it. If target exists, skip and report.
   - Does NOT delete or modify the source `.claude/commands/ithy-opsx/`
     files — user's `.claude/` remains intact.
   - Idempotent, dryRun-aware.
   - Returns `{ copied: string[], skipped: Array<{ path, reason }> }`.

2. **installSkills wire-up**: invoke the new helper alongside the
   existing legacy-dir migration when antigravity is selected.
   Result surfaces as a SECOND entry in `InstallResult.migrations`
   (one for `.agent/` legacy, one for `.claude/` legacy).

3. **Semantics distinction — migrations vs copies**: extend the
   `InstallResult.migrations` entry shape slightly. The legacy-dir
   migration (`.agent/` → `.agents/`) is destructive (MOVE); this
   new copy is non-destructive (COPY). To keep them
   distinguishable, add an optional `kind: "move" | "copy"` field
   on each migration entry (defaults to `"move"` for the existing
   entry to preserve back-compat, `"copy"` for the new entry).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `cross-cli-skill-installer`: extend the antigravity install
  behavior with a `.claude/commands/ithy-opsx/*.md` → `.agents/
  workflows/ithy-opsx/*.md` COPY step, complementary to the
  existing legacy `.agent/workflows/` MOVE step. Two new scenarios
  under the existing per-CLI-renderer requirement (copy + copy-
  skip-on-conflict).

## Impact

- `server/skill-renderer/migrate-agy.ts` — add
  `copyClaudeIthyOpsxCommandsToAgents` alongside
  `migrateLegacyAntigravityDir`.
- `server/skill-renderer/types.ts` — add optional `kind: "move" | "copy"`
  to `migrations[]` entry shape.
- `server/skill-renderer/index.ts` — invoke both helpers when
  antigravity is selected; push a second `migrations[]` entry.
- `server/skill-renderer.test.ts` — 5 new tests: unit copy,
  unit skip-on-conflict, unit idempotent, unit dry-run, install
  wire-up e2e.
- test-proj2 unblocked: after this lands, a re-run of installSkills
  on any project with `.claude/commands/ithy-opsx/*.md` will get
  those files also mirrored to `.agents/workflows/ithy-opsx/` so
  agy actually discovers them.
- `.claude/` is NEVER modified by this change — Claude users of
  the same project remain unaffected.

## Design notes

**Why not gate on "Claude also selected"?** Considered guarding
the copy with "only run when claude is NOT among selectedClis"
to avoid duplicating files in mixed installs. Rejected because:
- The copy is safe regardless (target-conflict skip prevents
  overwrites).
- Mixed-CLI installs are rare in practice, and having the file
  in both places doesn't harm either CLI.
- Simpler guard (always run when antigravity is selected) is
  easier to reason about and easier to test.

**Why co-locate with `migrate-agy.ts` rather than a new file?**
Both operations are agy-specific rescue routines that fire under
the same install condition. Splitting them into separate files
would just add import surface without improving cohesion. Two
exports from one file matches the "renderer-adjacent utilities"
shape already established.
