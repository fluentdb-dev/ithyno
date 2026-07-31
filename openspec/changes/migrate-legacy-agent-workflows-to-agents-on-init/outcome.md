# Outcome — migrate-legacy-agent-workflows-to-agents-on-init

## ✅ Worked

- **Design was clean, impl matched the propose 1:1.** No mid-flight
  contract changes. `migrateLegacyAntigravityDir` is a self-contained
  ~90-line helper with clear inputs (`projectRoot`, `dryRun`) and a
  small return shape. The `InstallResult.migrations` array wires in
  with three lines of code in `installSkills`. No refactor was
  needed to make room for it.
- **Test coverage was exhaustive without being brittle.** Two
  describe blocks — unit tests on the helper (6 scenarios) and
  install-time wire-up tests (5 scenarios) — cover every branch:
  move, skip-on-conflict, idempotent, no-op-when-missing,
  dry-run, cleanup of empty parents, don't-run-when-CLI-not-selected,
  and the interesting order-of-operations case where migration
  moves a stale `ithy-opsx-apply.md` and then the renderer overwrites
  it with correct content. Went from 38 → 49 tests, all green
  first run.
- **`fs.rename` semantics on macOS handled correctly.** Move is
  atomic within the same filesystem (test-proj2 → tmpdir would
  fail across filesystems, but everything here is same-fs). No
  copy-then-unlink fallback needed for the design.

## ⚠️ Surprises

- **`.agents/` on test-proj2 is macOS-protected.** When I tried to
  `rm -rf .agents/` for a fresh smoke test, macOS returned
  "Operation not permitted" even under the same user. Suspect
  a sandbox/entitlements interaction from a prior process context.
  Not a bug in the migration — the in-tmpdir e2e tests exercise
  the same code paths and confirm behavior. But it means the
  planned task 3.4 "manual smoke on test-proj2" is deferred to
  the user, who can `sudo rm` or `chflags nouchg` and re-verify.
- **openspec's antigravity adapter is genuinely out of date.** This
  isn't a "we picked the wrong path" — openspec's own source
  (`node_modules/@fission-ai/openspec/dist/core/command-generation/
  adapters/antigravity.js`) still emits at `.agent/workflows/`.
  Every user who runs `openspec init --tools antigravity` today
  gets stranded output. The migration is the right workaround
  until openspec upstream corrects their adapter.

## 🔁 Differently next time

- **Consider generalizing the migration hook shape.** Right now
  `installSkills` has a one-off `if (selectedClis.includes("antigravity"))`
  branch. If a second CLI ever needs a similar migration, we'd
  hardcode a second branch. Cleaner would be a `renderer.migrations?:
  Array<(projectRoot, opts) => Promise<...>>` field on the
  `Renderer` interface, letting each renderer declare its own
  migrations. Deferred — YAGNI until a second case appears.
- **File-based propose (proposal.md/tasks.md/specs) via the CLI
  scaffolding + hand-authored contents worked well.** The scenarios
  in the spec delta guided test authoring directly — 1:1 mapping
  between "#### Scenario:" blocks and `it(...)` calls. Keep this
  pattern.

## 🌱 Follow-ups

0. **NEW — `.claude/commands/ithy-opsx/*` → `.agents/workflows/`
   migration for agy projects.** User feedback surfaced during
   impl (2026-07-31): projects scaffolded before the per-CLI
   renderer landed have their `ithy-opsx-*` commands stranded at
   `.claude/commands/ithy-opsx/*.md` even when Manager=agy. agy
   doesn't read `.claude/`, so those custom slash commands are
   invisible. This change's migration only covers openspec's
   `.agent/workflows/opsx-*` legacy, NOT ithyno-ui's own
   `.claude/commands/ithy-opsx/*` legacy. Warrants a separate
   propose (spec-level; observable behavior; needs guard on
   "Claude not also selected" to avoid clobbering active Claude
   installs). Priority: HIGH — user reported this is the actual
   blocker for their agy Manager Kanban Start.
1. **Report upstream to openspec.** File an issue on the openspec
   repo pointing at their antigravity adapter's stale `.agent/`
   path. Once they fix it, this migration becomes a legacy-cleanup
   helper (still useful for existing projects) but no longer
   compensates for a live bug.
2. **Consider a follow-up "removed as of openspec vX" test hook**
   that skips the migration wire-up once the upstream fix lands
   AND the project has bumped its openspec dep past that version.
   Deferred — one thing at a time.
3. **Cursor's frontmatter has `alwaysApply: false` legacy field.**
   Discovered in-passing while reviewing the previous
   `align-renderer-paths-with-openspec-adapters` fix — Cursor's
   `.mdc` rules used that field, but under the new
   `.cursor/commands/*.md` shape it's likely irrelevant. Verify
   and remove if unnecessary. Not in this change's scope.
4. **The `void migrations: []` in `InstallResult` breaks JSON
   consumers that were pinned to the old shape.** If any
   downstream code (init-handler, HTTP endpoint response) destructures
   `InstallResult` non-permissively, add the new field to their
   expected shape. Grep found none in the current tree; leaving
   as follow-up in case of embedded/vendored consumers.
