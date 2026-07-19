## 1. Slash command entry point

- [x] 1.1 `.claude/commands/opsx/revert.md` — frontmatter (name, description, tags), 1-line summary, argument spec, delegation to the `opsx-revert` skill (same shape as `.claude/commands/opsx/propose.md`)

## 2. Workflow skill

- [x] 2.1 `.claude/skills/opsx-revert/SKILL.md` — full recipe:
  - Preflight (repo state, git identity, active changes list)
  - Argument handling (`<scope>` optional; prompt if missing)
  - Target collection (interactive requirement picker per capability)
  - Case classification (α = archived, β = in-flight)
  - `openspec new change revert-<scope>` invocation
  - `proposal.md` skeleton (Why + Targets)
  - `specs/<capability>/spec.md` delta headers (REMOVED / MODIFIED / ADDED)
  - `tasks.md` skeleton (standard revert checklist)
  - PENDING annotation insertion into current specs
  - REVERTED annotation insertion into Case α target archives
  - Case β reverted-target archive procedure
  - `openspec validate` invocation
  - Success report / error surfacing

## 3. Spec delta

- [x] 3.1 `openspec/changes/add-opsx-revert-command/specs/dashboard/spec.md` — 1 ADDED `Revert Slash Command` requirement covering the contract
- [x] 3.2 `npm run openspec -- validate add-opsx-revert-command` VALID

## 4. Verification

- [x] 4.1 Manual dry-read of the skill against the recent `revert-kanban-ui-lanes` flow — every hand-typed step there maps to a numbered step in the skill
- [x] 4.2 `npm test && npm run typecheck && npm run build` clean (test count 233 unchanged; no code changes)
- [ ] 4.3 Skill: invoke `/opsx:revert <scope>` in Claude Code — preflight (repo state / git identity / openspec CLI) runs
- [ ] 4.4 Skill: target-requirement pick prompt appears
- [ ] 4.5 Skill: Case α / β classification is correct per target
- [ ] 4.6 Skill: `openspec new change revert-<scope>` runs and generates proposal.md / delta / tasks.md
- [ ] 4.7 Skill: PENDING annotation is inserted into the current spec for each targeted requirement
- [ ] 4.8 Skill: For Case α, REVERTED annotation is inserted at the top of each archived target's proposal.md
- [ ] 4.9 Skill: `openspec validate` reports VALID
- [ ] 4.10 Skill: no `git commit`, no `openspec archive`, no destructive git action is taken

## 5. Post-impl

- [x] 5.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 5.2 archive → user runs `/ithy-opsx:archive` after confirming 4.3–4.10
- [ ] 5.3 Use `/opsx:revert` for the next revert (if any) to shake out edge cases — deferred until the next revert opportunity
