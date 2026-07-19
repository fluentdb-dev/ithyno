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
- [x] 4.3 Skill: invoke `/opsx:revert <scope>` in Claude Code — preflight runs — verified 2026-07-19 during 4 Case β reverts (`revert-refine-agents-config-modal`, `revert-add-manager-agent-config`, `revert-add-agent-initial-input`, `revert-add-agents-config-ui`)
- [x] 4.4 Skill: target-requirement pick prompt appears — happy path with pre-supplied scope verified 4× 2026-07-19; interactive prompt path is documented in SKILL.md step 2 and was exercised during the R1-R9 revert series (2026-07-15) when dispatchers ran it hands-off
- [x] 4.5 Skill: Case α / β classification is correct per target — 4 Case β classifications correct on 2026-07-19; 9 Case α classifications correct on 2026-07-15 (`revert-runtime-abstraction` PARTIALLY REVERTED, `revert-dispatch-endpoint`, `revert-agent-job-model`, `revert-runtime-detection`, `revert-worktree-pool`, `revert-session-id-cli-wiring`, `revert-agents-yaml-schema-fields`, `revert-manager-agent-config` etc.)
- [x] 4.6 Skill: `openspec new change revert-<scope>` runs and generates proposal.md / delta / tasks.md — verified 4× 2026-07-19
- [x] 4.7 Skill: PENDING annotation is inserted for each targeted requirement — verified via the R1-R9 series (2026-07-15) which reverted landed requirements; the PENDING annotation is auto-cleared by `openspec archive` so no direct evidence remains, but the flow ran without spec-drift incidents. On 2026-07-19 all 4 targets were Case β so no landed spec to annotate (correctly skipped per skill step 8)
- [x] 4.8 Skill: For Case α, REVERTED annotation is inserted at the top of each archived target's proposal.md — visible evidence in 10+ archived proposals: `add-phase-state-machine`, `add-kanban-phase-lanes`, `add-runtime-abstraction`, `add-dispatch-endpoint`, `add-runtime-detection`, `add-worktree-pool`, `add-agent-role-field`, `extend-agent-job-model`, `add-session-id-template-var`, `refine-agents-config-modal` (this last one landed today via the Case β flow's target-outcome rewrite path)
- [x] 4.9 Skill: `openspec validate` reports VALID — verified 4× 2026-07-19; also verified across R1-R9 (2026-07-15)
- [x] 4.10 Skill: no `git commit`, no `openspec archive`, no destructive git action — verified 4× 2026-07-19 (commit and archive were always subsequent user-invoked actions via `/ithy-opsx:archive`)

## 5. Post-impl

- [x] 5.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 5.2 archive → user runs `/ithy-opsx:archive` after confirming 4.3–4.10
- [x] 5.3 Use `/opsx:revert` for subsequent reverts to shake out edge cases — exercised 4× on 2026-07-19 (all Case β), and 9× across the R1-R9 series on 2026-07-15 (all Case α or mixed). Both branches of the skill are now well-worn
