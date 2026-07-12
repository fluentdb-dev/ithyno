## 1. Slash command entry point

- [ ] 1.1 `.claude/commands/opsx/revert.md` — frontmatter (name, description, tags), 1-line summary, argument spec, delegation to the `opsx-revert` skill (same shape as `.claude/commands/opsx/propose.md`)

## 2. Workflow skill

- [ ] 2.1 `.claude/skills/opsx-revert/SKILL.md` — full recipe:
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
  - `openspec validate` invocation
  - Success report / error surfacing

## 3. Spec delta

- [x] 3.1 `openspec/changes/add-opsx-revert-command/specs/dashboard/spec.md` — 1 ADDED `Revert Slash Command` requirement covering the contract
- [ ] 3.2 `npm run openspec -- validate add-opsx-revert-command` VALID

## 4. Verification

- [ ] 4.1 Run through the recipe manually against a hypothetical target (dry-run without executing writes) to confirm every step has clear enough guidance for Claude to follow
- [ ] 4.2 `npm test && npm run typecheck && npm run build` clean (no code changes but confirm nothing regressed)

## 5. Post-impl

- [ ] 5.1 phase-workflow へ merge (worktree flow)
- [ ] 5.2 archive → phase-workflow に archive commit
- [ ] 5.3 Use `/opsx:revert` for the next revert (if any) to shake out edge cases
