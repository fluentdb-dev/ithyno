---
tags: [testing, ci, init, ithy-opsx, templates, drift-guard, package-shape]
execution: worktree
---

## Why

`distribute-ithy-opsx-via-init-templates` moved `/ithy-opsx:*` shipping to
`templates/.claude/` scaffolded via `bin/init.js::walkTemplates`. The drift
guard catches divergence between dev-copy and template, but two structural
regressions can still slip through undetected:

1. A future edit to `bin/init.js` (or its `walkTemplates` walk) that stops
   copying `templates/.claude/skills/ithy-opsx-*/` — the drift guard still
   passes (dev-copy ≡ templates), but scaffolded targets get an empty
   `.claude/`.
2. A future edit to root `package.json` `files` that re-adds bare
   `.claude/commands/ithy-opsx` (the exact pattern this change deleted) —
   the dev-copy would be shipped twice: once via `templates/`, once again
   at the top-level `.claude/`, and consumers of npm/electron artefacts
   would receive stale copies.

Neither is caught by any existing test. Both are load-bearing invariants
of the corrective distribution the previous change established. This is
the Phase A foundation from
[`docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`](../../../docs/ideas/2026-07-26-comprehensive-skill-test-plan.md);
subsequent proposals (`add-bundle-verification-script`,
`add-windows-ci-matrix`, `add-skill-e2e-harness`) build on it.

## What Changes

- **New**: `server/init-scaffold.test.ts` (or a new `describe(...)` block
  inside `server/init.test.ts`) — runs `runInit()` against a `mkdtemp()`
  target with `autoGitInit: true` and asserts:
  - Every file under `.claude/commands/ithy-opsx/` has a byte-identical
    counterpart at `<target>/.claude/commands/ithy-opsx/<name>` post-init.
  - Every skill dir under `.claude/skills/ithy-opsx-*/` is present at
    `<target>/.claude/skills/<skill>/…` post-init.
  - The file counts match the dev-copy counts (11 commands + 6 skills at
    time of writing; the test iterates rather than hard-coding numbers
    to survive additions).
- **New**: package-shape assertion — either `scripts/assert-npm-pack.mjs`
  invoked from `npm test` via a new vitest `describe`, or an inline
  vitest that shells out to `npm pack --dry-run --json` and asserts:
  - Every ithy-opsx entry in the tarball lives under `templates/.claude/…`.
  - No entry matches `^\.claude/commands/ithy-opsx` or
    `^\.claude/skills/ithy-opsx-`.
- **Non-goals**: this change does NOT test skill *runtime behavior* —
  that is the scope of the later `add-skill-e2e-harness`. It only
  proves that the scaffolded layout and the packaged artefact shape
  match the distribute-ithy-opsx contract.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `dashboard`: adds two testing invariants to the "Ithyno Init scaffolds
  `/ithy-opsx:*` into the target project" requirement — the scaffold
  reachability (via `runInit` smoke) and the package shape (via npm-pack
  assertion). Both are ADDED scenarios under the existing requirement,
  not new requirements.

## Impact

- **Test files added**: 1 (`server/init.test.ts` gets 2 new `describe`
  blocks, or a sibling `init-scaffold.test.ts` file is added).
- **Scripts added** (optional): `scripts/assert-npm-pack.mjs` if the
  package-shape check is factored out for reuse by `release:build`
  later. Alternative: inline in vitest.
- **CI runtime**: `runInit()` smoke ~1s (tmpdir + git init + template
  copy). `npm pack --dry-run` ~2-3s. Total ~5s added to `npm test`.
- **No source code changes.** No `bin/init.js`, `server/*.ts`, or
  `package.json` files edit — this change is test-only.
- **No spec-level behavior change.** The two invariants being asserted
  are already promised by the distribute-ithy-opsx requirement; this
  change adds test coverage, not new contract.
