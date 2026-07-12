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
- [ ] 4.3 Skill 実動作確認 (user, 次の revert 時):
  - [ ] a. Claude Code で `/opsx:revert <scope>` を invoke → preflight (repo state / git identity / openspec CLI) が走る
  - [ ] b. 対象 requirement の pick prompt が出る
  - [ ] c. Case α/β 自動分類が正しい
  - [ ] d. `openspec new change revert-<scope>` が実行され proposal.md / delta / tasks.md が生成される
  - [ ] e. 現行 spec に PENDING annotation が挿入される
  - [ ] f. Case α なら archived target proposal.md に REVERTED annotation が挿入される
  - [ ] g. `openspec validate` が VALID を返す
  - [ ] h. 一切 git commit / archive を触らないことを確認

## 5. Post-impl

- [x] 5.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 5.2 archive → user が 4.3 を確認後に実施
- [ ] 5.3 Use `/opsx:revert` for the next revert (if any) to shake out edge cases — deferred until the next revert opportunity
