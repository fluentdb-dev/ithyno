# Tasks

## 1. Rule update — CLAUDE.md

- [ ] 1.1 In the `## In-flight spec 注記 (Hard rule)` section, rewrite the "Format" block so the PENDING annotation appears **after** the SHALL/MUST body line (still before any `#### Scenario:` header). Keep the leading blank line so the blockquote renders correctly.
- [ ] 1.2 Add a one-liner rationale ("openspec CLI parses the first non-empty line as `text` — the annotation would swallow the SHALL/MUST check") so a future contributor understands why the natural under-heading position is wrong.

## 2. Reposition currently-live annotations

- [ ] 2.1 Sweep `openspec/specs/**/spec.md` for `> ⚠️ **PENDING` blockquotes. Move each to sit after the requirement's SHALL/MUST body paragraph. Preserve the exact annotation text.
- [ ] 2.2 Confirm no in-flight change's `openspec archive` would now fail on this cause: run `openspec archive <id> --dry-run` (or the equivalent — see if the CLI supports it) for the 2 known in-flight changes, or run our own rebuild+validate simulator.

## 3. Skill/command update

- [ ] 3.1 In `.claude/skills/opsx-revert/SKILL.md`, update the "PENDING annotation" insertion step (step 6) to use the new position.
- [ ] 3.2 Sweep for other skills or docs that reference the annotation format (`grep -rn "PENDING <ADDED"` under `.claude/` + `docs/`) and update them consistently.

## 4. Regression coverage

- [ ] 4.1 Add a vitest at `server/openspec-annotation.test.ts` (or reuse an existing spec-lint test) that:
  - Enumerates every `### Requirement:` block under `openspec/specs/**/spec.md`.
  - Extracts the first non-blank, non-metadata line inside the block.
  - Asserts the line contains `SHALL` or `MUST`.
  - Fails with a message pointing at the offending file + requirement name.
- [ ] 4.2 Test: reject the pre-body position by adding a temp-fixture test where a synthetic requirement has an annotation in the wrong slot → assertion fails as expected.

## 5. Design note

- [ ] 5.1 Add `docs/adr/2026-07-28-pending-annotation-position.md` capturing:
  - The constraint (openspec parser's `text` = first non-empty line).
  - The choice (annotation after body, not before).
  - Alternative considered + rejected (fork the CLI, use HTML comments the parser might skip).
  - A pointer from CLAUDE.md's hard-rule section to this ADR.

## 6. Verification

- [ ] 6.1 `npm test` — includes the new annotation position test.
- [ ] 6.2 `npm run typecheck` clean.
- [ ] 6.3 `npm run openspec -- validate fix-pending-annotation-parser-compat --strict` passes.
- [ ] 6.4 Simulate an unrelated archive: pick a small in-flight change with a dashboard-spec delta and confirm `openspec archive <id>` (WITHOUT `--no-validate`) now completes without the SHALL/MUST rebuild error.
- [ ] 6.5 Write `openspec/changes/fix-pending-annotation-parser-compat/outcome.md`.
