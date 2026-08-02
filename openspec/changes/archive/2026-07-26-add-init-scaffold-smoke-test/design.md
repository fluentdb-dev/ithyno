## Context

Test-only change. `distribute-ithy-opsx-via-init-templates` established
`templates/.claude/…` as the sole shipping path for `/ithy-opsx:*` and
removed all user-global install machinery. That change added a drift
guard (dev-copy ↔ templates byte-identity), but two orthogonal
invariants — Init actually copies the templates into the target, and
`npm pack` doesn't reintroduce bare `.claude/…` shipping — are
unasserted. This change closes both gaps in the Vitest layer.

Foundation piece from `docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`
Phase A.

## Goals / Non-Goals

**Goals:**
- Fail-fast in CI when `bin/init.js` regresses and stops scaffolding
  ithy-opsx files.
- Fail-fast in CI when `package.json` `files` regresses and reintroduces
  bare `.claude/…` shipping.
- Iterate the dev-copy tree at test time so adding new commands / skills
  in future changes does not require test updates.
- Keep total test runtime overhead under ~5s (`runInit` on tmpdir + one
  `npm pack --dry-run` invocation).

**Non-Goals:**
- Runtime skill behavior — not tested here. `add-skill-e2e-harness`
  covers that separately.
- Electron / VSCode-extension packaging shape — `add-bundle-verification-script`
  covers those.
- Cross-platform (Windows) — `add-windows-ci-matrix` extends CI there.
- Post-condition on scaffolded target's git status ("untracked" bit) —
  covered transitively by the existing `runInit + writeAgentsYaml
  integration` test that creates a git repo first.

## Decisions

### D1: Extend `server/init.test.ts` rather than add a sibling file

**Choice**: append two new `describe(...)` blocks to `server/init.test.ts`.

**Rationale**: co-locates all Init-related tests (drift guard, unit
tests, and now smoke assertions). Editors and readers looking for
"where do we test Init?" find one file. Avoids the "which test file
does the CI runner pick up?" ambiguity.

**Alternative**: separate `server/init-scaffold.test.ts` — rejected on
locality grounds; only useful if the file grows past ~500 lines, which
is not the case (init.test.ts is ~370 lines currently).

### D2: `npm pack --dry-run --json` for package shape assertion, inline in Vitest

**Choice**: shell out to `npm pack --dry-run --json` from a Vitest test
and assert on the parsed `files[].path` array.

**Rationale**:
- `--json` output is stable enough for grep-free assertions.
- No new script file to maintain.
- Runtime is dominated by npm's own bookkeeping (~2-3s), acceptable in
  the test suite.

**Alternative considered**: extract into `scripts/assert-npm-pack.mjs`
and invoke from both Vitest and `release:build` — deferred to
`add-bundle-verification-script`, which will formalize the release-time
side. Doing both now would duplicate logic before the release-side
requirements are settled.

### D3: `runInit` smoke uses `mkdtemp` + `autoGitInit: true`, not a repo checkout

**Choice**: create an empty temp dir per test, let `runInit` do the
`git init`, then assert files land.

**Rationale**: matches how Electron / VSCode new-project flows call the
same endpoint on a fresh directory. Reusing the existing pattern from
`runInit + writeAgentsYaml integration` (which already does the same
setup) keeps the harness consistent.

**Alternative**: fixture-based (pre-created dir with git repo already
initialized) — rejected because it hides the `autoGitInit` code path
from the smoke.

### D4: Iterate dev-copy tree, don't hard-code counts

**Choice**: the test walks `.claude/commands/ithy-opsx/` and
`.claude/skills/ithy-opsx-*/`, then asserts each file has a match at
the corresponding `<target>/.claude/…`.

**Rationale**: adding a new `/ithy-opsx:*` command or a new
`ithy-opsx-*` skill directory should not require touching this test.
The drift guard already uses the same iteration pattern; this test
mirrors it.

## Risks / Trade-offs

- **npm-pack runtime variance** → typically 2-3s but can spike to ~10s
  on slow CI runners. Mitigation: mark the `describe` with `.slow` if
  Vitest categorizes slow tests, or extract to a separate suite gated
  behind a `CI=1` env var if it becomes a chronic pain point.
  Current expectation: acceptable.
- **npm output format drift** → `npm pack --dry-run --json` shape is
  stable across npm 9/10/11 (verified as of writing), but a future
  major npm release could reshape the output. Mitigation: assert
  defensively (`Array.isArray(pack.files)` check) and fail with a
  clear message so a future migration is one-file.
- **Test tmpdir cleanup on failure** → existing `afterEach` already
  covers this via `rm -rf`.

## Migration Plan

None. Test-only additive change. Rolling back is `git revert` of the
impl commit.

## Open Questions

None. Scope is small enough to implement directly from tasks.md.
