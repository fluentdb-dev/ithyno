# Outcome — add-init-scaffold-smoke-test

Landed 2026-07-26 as Phase A of the `2026-07-26-comprehensive-skill-test-plan`
idea. Closes two orthogonal invariants left unasserted by
`distribute-ithy-opsx-via-init-templates`:

1. **Scaffold reachability** — `runInit()` on a fresh `mkdtemp()` target
   copies every `.claude/commands/ithy-opsx/*.md` + every
   `.claude/skills/ithy-opsx-*/**` byte-identical. A future edit to
   `bin/init.js` or `walkTemplates` that stops picking up the ithy-opsx
   trees now fails CI even though the drift guard still passes.
2. **Package shape** — `npm pack --dry-run --json` output lists ithy-opsx
   entries ONLY under `templates/.claude/…`. A future `package.json`
   `files` edit that re-adds bare `.claude/commands/ithy-opsx` or
   `.claude/skills/ithy-opsx-*/**` fails CI immediately.

## ✅ Worked

- **Refactor first, add second.** Extracted `REPO_ROOT` + `walkFiles()`
  to module scope before writing the new tests. The existing drift-guard
  block reads cleaner too, and the two new smoke blocks reuse the helper
  without duplication. Total net addition: ~120 LOC (vs ~180 if the
  helpers were duplicated).
- **`npm pack --dry-run --json` parses cleanly on npm 11**. The shape
  is `[{files: [{path, size, ...}, ...], ...}]`; the defensive `Array.isArray`
  + object-shape guard means a future npm shape drift fails with a clear
  message rather than `undefined.filter is not a function`.
- **388ms** for the package-shape test on this machine — well under the
  30 s timeout, and dominated by `npm pack`'s own bookkeeping. Overall
  `npm test` grew from ~19 s to ~19 s (measurement noise dominates —
  the 3 new tests add maybe 500 ms).
- **Iteration-based test structure** (walking dev-copy → asserting
  target) means adding a new `/ithy-opsx:*` command or a new
  `ithy-opsx-*` skill directory doesn't require test updates. The
  drift guard already used this pattern; the scaffold smoke mirrors it.
- **Zero source-code changes.** Test-only, exactly as promised in the
  proposal.

## ⚠️ Surprises

- **The existing drift-guard block had `const repoRoot = process.cwd()`
  captured inside the `describe` closure.** When extracting to module
  scope, I renamed to `REPO_ROOT` for the caps convention and had to
  update every reference. Small footgun for anyone who tries the same
  extraction on `walk()` alone — the two are coupled through their
  common callers.
- **`walk` → `walkFiles` rename during extraction** was worth doing
  even though it made the diff noisier — `walk` at module scope in a
  file that also imports `execFile` and works with tempdirs would have
  been ambiguous.
- **`npx vitest run server/init.test.ts` shows individual `it()` timings
  only when `>= 300 ms`** — the pack test shows up (388 ms) but the
  scaffold tests don't (each ~150 ms). Not a bug, just useful to know.

## 🔁 Do Differently

- Nothing structural. If I did this again, I might have factored the
  "walk two trees and compare byte-identical, with a named-pair error
  format" logic into its own helper, since it appears 4 times now
  (2 in drift guard, 2 in scaffold smoke). Left for later — 4 copies
  is at the boundary where a helper starts paying off.

## 🌱 Follow-ups

1. **`add-bundle-verification-script`** (Phase B, already proposed) —
   extends the package-shape check from the source-tree `npm pack` to
   packaged Electron bundles. Same invariant, different distribution
   surface.
2. **`add-windows-ci-matrix`** (Phase C, already proposed) — runs these
   3 new tests on Windows too. On Windows the `npm pack` output uses
   `/` separators same as macOS (npm normalizes), so the current
   regex-based path checks should Just Work — but confirm at CI time.
3. **`add-skill-e2e-harness`** (Phase D, already proposed) — proves
   the scaffolded commands ACTUALLY work at runtime by invoking each
   `/ithy-opsx:*` skill on a scaffolded target. Beyond this change's
   scope (which only proves the files reach the target).
