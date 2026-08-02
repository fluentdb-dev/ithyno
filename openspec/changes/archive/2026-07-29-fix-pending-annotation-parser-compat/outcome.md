# Outcome

## ✅ Worked

- **CI regression test at `server/openspec-annotation.test.ts` is the load-bearing bit.** The CLAUDE.md/skill copy edits document the rule for humans, but the test is what actually prevents drift. It walks every `openspec/specs/**/spec.md`, extracts each requirement's first non-empty content line (mirroring `parseRequirements` + `extractRequirementText` from `@fission-ai/openspec`), and asserts SHALL/MUST. Runs in 7ms across the whole tree — cheap enough to keep forever.
- **Synthetic fixture tests catch the two edge shapes.** One pre-body annotation (should be rejected), one post-body annotation (should pass). Documents the rule inline as executable spec, so a future contributor who wonders "which position again?" can just read the test.
- **Repositioning existing annotations was mechanical.** All 4 sites in `openspec/specs/dashboard/spec.md` followed the same 3-line swap. No annotation text needed to change; only the newline positions.
- **Template drift check (`server/init.test.ts`) caught the missed `templates/.claude/skills/openspec-flow/SKILL.md` sync.** Reminder that anything under `.claude/skills/` also lives in `templates/.claude/skills/` for the init scaffolder and both must stay in step.

## ⚠️ Surprises

- **The bug was systemic, not local.** I had assumed archive failures scoped to the change owning the annotation. In reality any archive touching the same capability re-parses the whole spec after applying the delta, so 4 in-flight annotations from 2 unrelated changes blocked 4 more unrelated archives. That's why using `--no-validate` had felt like the default lately — it was the only path through.
- **The openspec CLI's `extractRequirementText` differs slightly between the delta validator (`applyDeltaRules`) and the rebuild validator (`applySpecRules` → `SpecSchema.safeParse` → `RequirementSchema`).** The delta validator only looks at the delta blocks; the rebuild validator re-parses the full spec after fold-in. Same rule (`SHALL|MUST` in `text`), different code paths. The rebuild check is the strict one.
- **No `--dry-run` flag on `openspec archive`.** Task 6.4 wanted "simulate an archive without writing" — the CLI doesn't expose that. The workaround is the CI test at 4.1, which asserts the invariant the rebuild would check. Good-enough coverage without a real archive.
- **The ADR at `docs/adr/2026-07-28-pending-annotation-position.md` is the first ADR in this repo.** The `docs/adr/` directory didn't exist before this change. If we get more, they'll live here.

## 🔁 Differently

- **I could have upstream-fixed the parser.** `parseRequirements` skipping blockquotes when extracting `text` would be a one-line fix in the CLI. Rejected as "not our code" — the maintenance cost of a fork or PR round-trip beats a project-side convention adjustment. But if the pattern of "openspec CLI has a subtle rule we work around" grows, forking becomes cheaper.
- **The regression test could also fold in openspec's own validation.** Right now the test re-implements the first-line rule. If openspec ever exposes `validateSpecContent` as a JS API, we could call it directly and get free coverage of any other rules the CLI adds later.

## 🌱 Follow-ups

- **`scripts/verify-archive-rebuild.mjs` should probably migrate into the test suite.** Written as a one-off verification aid for task 6.4 — walks every in-flight change, applies its delta to the live spec in-memory, and validates the rebuild. Surfaced 8 unrelated "MODIFIED requirement not found" errors (stale references from long-idle changes). Not blocking, but a promotion to vitest would catch new drift automatically.
- **Extend the lint to `openspec/changes/**\/specs/**/spec.md`.** Delta specs also have `### Requirement:` blocks and the same first-line rule applies (per `applyDeltaRules`). The test currently only walks `openspec/specs/`. Broadening would catch propose-time regressions before they land.
- **Auto-fixer.** A `scripts/fix-annotation-position.mjs` that walks specs and moves misplaced annotations to the correct slot would let contributors fix drift without hand-editing. Not needed today (0 offenders) but the shape is trivial (regex + swap).
- **CLAUDE.md is normative, but a fresh contributor reading `openspec/specs/dashboard/spec.md` and wondering "what's this blockquote for" might not connect it to CLAUDE.md.** A brief inline comment convention like `<!-- see CLAUDE.md In-flight spec 注記 -->` on the first PENDING annotation of a file could help discovery. Minor.
- **Consider making the annotation format itself less scary-looking.** The `> ⚠️` blockquote is loud in the spec render. Could use a `> [!NOTE]` GitHub-style admonition or a simpler `<!-- PENDING: ... -->` HTML comment (drops visibility but the archive-time auto-cleanup still works). Trade-off: readability vs. quiet-in-rendered-output.
