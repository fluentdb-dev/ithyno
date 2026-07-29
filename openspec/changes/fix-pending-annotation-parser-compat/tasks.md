# Tasks

## 1. Rule update — CLAUDE.md

- [x] 1.1 In the `## In-flight spec 注記 (Hard rule)` section, rewrite the "Format" block so the PENDING annotation appears **after** the SHALL/MUST body line (still before any `#### Scenario:` header). Keep the leading blank line so the blockquote renders correctly.
- [x] 1.2 Add a one-liner rationale ("openspec CLI parses the first non-empty line as `text` — the annotation would swallow the SHALL/MUST check") so a future contributor understands why the natural under-heading position is wrong.

## 2. Reposition currently-live annotations

- [x] 2.1 Sweep `openspec/specs/**/spec.md` for `> ⚠️ **PENDING` blockquotes. Move each to sit after the requirement's SHALL/MUST body paragraph. Preserve the exact annotation text. — 4 annotations repositioned in `openspec/specs/dashboard/spec.md` (Escalate/Answer/Revert command wrappers + Import endpoint).
- [x] 2.2 Confirm no in-flight change's `openspec archive` would now fail on this cause: run `openspec archive <id> --dry-run` (or the equivalent — see if the CLI supports it) for the 2 known in-flight changes, or run our own rebuild+validate simulator. — CI test at `server/openspec-annotation.test.ts` walks every spec.md and asserts first-line SHALL/MUST; passes with 0 offenders.

## 3. Skill/command update

- [x] 3.1 In `.claude/skills/opsx-revert/SKILL.md`, update the "PENDING annotation" insertion step (step 6) to use the new position. — `.claude/skills/ithy-opsx-revert/SKILL.md` step 8 updated.
- [x] 3.2 Sweep for other skills or docs that reference the annotation format (`grep -rn "PENDING <ADDED"` under `.claude/` + `docs/`) and update them consistently. — `.claude/skills/openspec-flow/SKILL.md` + `templates/.claude/skills/openspec-flow/SKILL.md` synced.

## 4. Regression coverage

- [x] 4.1 Add a vitest at `server/openspec-annotation.test.ts` that:
  - Enumerates every `### Requirement:` block under `openspec/specs/**/spec.md`.
  - Extracts the first non-blank, non-metadata line inside the block.
  - Asserts the line contains `SHALL` or `MUST`.
  - Fails with a message pointing at the offending file + requirement name.
- [x] 4.2 Test: reject the pre-body position by adding a temp-fixture test where a synthetic requirement has an annotation in the wrong slot → assertion fails as expected. — 2 synthetic fixture tests (bad + good) confirm the rule.

## 5. Design note

- [x] 5.1 Add `docs/adr/2026-07-28-pending-annotation-position.md` capturing:
  - The constraint (openspec parser's `text` = first non-empty line).
  - The choice (annotation after body, not before).
  - Alternative considered + rejected (fork the CLI, use HTML comments the parser might skip).
  - A pointer from CLAUDE.md's hard-rule section to this ADR.

## 6. Verification

- [x] 6.1 `npm test` — includes the new annotation position test. — 607 passed / 1 unrelated failure (`scripts/build-icons.test.mjs` sharp missing in this env).
- [x] 6.2 `npm run typecheck` clean.
- [x] 6.3 `npm run openspec -- validate fix-pending-annotation-parser-compat --strict` passes.
- [x] 6.4 Simulate an unrelated archive: pick a small in-flight change with a dashboard-spec delta and confirm `openspec archive <id>` (WITHOUT `--no-validate`) now completes without the SHALL/MUST rebuild error. — Verified via `scripts/verify-archive-rebuild.mjs` (dry-run rebuild+validate across all 26 in-flight change specs). Both annotation-owning changes pass: `unify-ithyno-slash-command-surface` dashboard → PASS, `enable-import-both-patterns` dashboard → PASS. Zero SHALL/MUST failures repo-wide. (8 unrelated ERRORs are stale MODIFIED-refers-to-missing-requirement — pre-existing, different class of bug.)
- [x] 6.5 Write `openspec/changes/fix-pending-annotation-parser-compat/outcome.md`.
