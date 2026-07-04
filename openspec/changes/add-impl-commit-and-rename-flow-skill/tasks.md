## 1. Skill rename

- [ ] 1.1 `git mv .claude/skills/openspec-flow .claude/skills/ithy-flow` (dogfooding copy)
- [ ] 1.2 `git mv templates/.claude/skills/openspec-flow templates/.claude/skills/ithy-flow` (init template)
- [ ] 1.3 Update `name:` frontmatter in both `SKILL.md` files: `name: ithy-flow`
- [ ] 1.4 Update `description:` frontmatter to make ownership explicit: "ithyno's project-local workflow that composes with the upstream OpenSpec skills (openspec-propose, openspec-apply-change, openspec-archive-change)"

## 2. `impl:` commit step — CLAUDE.md

- [ ] 2.1 Root `CLAUDE.md`: add step `4a` to the Standard order:
  ```
  4a. Commit as `impl: <id>` once §1–§(last-verify-section) tasks tick, code type-checks, and tests pass on main. Verify tasks may still be pending — the impl commit records "this is what shipped" independent of the verify pass.
  ```
- [ ] 2.2 Root `CLAUDE.md`: add a short paragraph explaining the three commit types: propose / impl / archive (with example subject lines)
- [ ] 2.3 `templates/CLAUDE.md`: mirror the same additions

## 3. `impl:` commit step — ithy-flow skill

- [ ] 3.1 `.claude/skills/ithy-flow/SKILL.md`: extend the loop description to include the impl commit
- [ ] 3.2 `templates/.claude/skills/ithy-flow/SKILL.md`: mirror

## 4. Reference updates for the rename

- [ ] 4.1 Grep the repo for `openspec-flow` references (excluding the skill dir itself and archived changes' historical prose) and replace with `ithy-flow`
- [ ] 4.2 `ithy-opsx-apply/SKILL.md`: add a "Main-tree case" note — agent-branch case is unchanged; main-tree implementations follow the `impl:` commit rule
- [ ] 4.3 `ithy-opsx-archive/SKILL.md`: add a "Precondition on main tree" note — the impl commit precedes archive so the archive commit is a clean file-moves-only diff

## 5. Multi-change impl commit convention

- [ ] 5.1 Add to `CLAUDE.md` (and `ithy-flow/SKILL.md`) a short section: "When multiple in-flight changes touch the same file, one impl commit MAY carry more than one change id — subject line uses a compound form (`impl: <id-a> + <id-b>`); archive commits stay per-change"

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-impl-commit-and-rename-flow-skill/specs/dashboard/spec.md`: MODIFIED requirement covering the three-commit-type workflow and the renamed flow skill's path

## 7. Verification

- [ ] 7.1 `openspec validate --all` passes (specs / spec deltas still parse after the rename)
- [ ] 7.2 Grep for stale `openspec-flow` mentions returns only intended survivors (archived changes' outcome / prose)
- [ ] 7.3 Root `CLAUDE.md` reads cleanly and describes the three commit types unambiguously (peer / self review)
- [ ] 7.4 On the next in-flight change worked on THIS repo, land the impl as a real `impl: <id>` commit before archiving — verify the pattern feels natural in practice
