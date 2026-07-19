## 1. `/opsx:manage` slash command

- [x] 1.1 `.claude/commands/opsx/manage.md` 新規作成、frontmatter
- [x] 1.2 Body: Read change context (proposal / tasks / specs / .openspec.yaml)
- [x] 1.3 GET current phase、`done | needs-human` なら exit
- [x] 1.4 MAX_ITERATIONS = 5 の loop skeleton (convergence guard)
- [x] 1.5 Loop 内: dispatch code → status check → set phase=coded
- [x] 1.6 Loop 内: dispatch review → parse verdict → 分岐
- [x] 1.7 pass → set phase=reviewed、break loop
- [x] 1.8 needs-rework → findings を priorFindings に format、continue
- [x] 1.9 undefined verdict → escalate、exit
- [x] 1.10 Loop 後: dispatch verify → parse verdict、pass なら done、needs-rework/undefined なら escalate
- [x] 1.11 Escalation 呼び方明示

## 2. `/opsx:code` slash command (code worker)

- [x] 2.1 `.claude/commands/opsx/code.md` 新規作成
- [x] 2.2 Body: proposal + tasks + specs Read、promptSuffix を context 化
- [x] 2.3 Worktree で tasks 実装 (未 tick 順)、既存 `ithy-opsx-apply` の pattern
- [x] 2.4 escalate 条件 (schema / dep / unsatisfiable / prior verify-failure / dirty worktree)

## 3. Documentation

- [x] 3.1 `docs/2026-07-11-manager-usage-and-agents-migration.md`
- [x] 3.2 `docs/ideas/2026-07-11-manager-max-iterations-config.md`
- [x] 3.3 `docs/ideas/2026-07-11-verify-command-per-project.md`

## 4. Spec delta

- [x] 4.1 2 ADDED requirements
- [x] 4.2 `npm run openspec -- validate add-manager-loop-skill` VALID

## 5. Manual verification

- [ ] 5.1 agents.yaml に review-claude / verify-claude / code-claude 手書き — DEFERRED to post-merge smoke
- [ ] 5.2 `/opsx:manage <id>` を PTY で叩き loop 動作確認 — DEFERRED
- [ ] 5.3 needs-rework loop 収束確認 — DEFERRED

## 6. Verification

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean (code 変更なし、234 tests 維持)

## 7. Post-impl

- [x] 7.1 phase-workflow へ merge — merge step で
- [x] 7.2 archive → phase-workflow に archive commit — archive step で
- [x] 7.3 Phase 4 完了、次: main への大 merge or Phase 5.1
