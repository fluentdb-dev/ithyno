## 1. `/opsx:manage` slash command

- [ ] 1.1 `.claude/commands/opsx/manage.md` 新規作成、frontmatter (name, description, argument-hint)
- [ ] 1.2 Body: Read change context (proposal / tasks / specs / .openspec.yaml)
- [ ] 1.3 GET current phase、`done | needs-human` なら exit
- [ ] 1.4 MAX_ITERATIONS = 5 の loop skeleton (convergence guard)
- [ ] 1.5 Loop 内: dispatch code → verify status → set phase=coded
- [ ] 1.6 Loop 内: dispatch review → parse verdict → 分岐 (pass/needs-rework/undefined)
- [ ] 1.7 pass → set phase=reviewed、break loop
- [ ] 1.8 needs-rework → findings を priorFindings に format、continue loop
- [ ] 1.9 undefined verdict → escalate、exit
- [ ] 1.10 Loop 後: dispatch verify → parse verdict、pass なら set phase=done、needs-rework なら escalate
- [ ] 1.11 Escalation の際 `/opsx:escalate <id> "<reason>"` を明示

## 2. `/opsx:code` slash command (code worker)

- [ ] 2.1 `.claude/commands/opsx/code.md` 新規作成
- [ ] 2.2 Body: proposal + tasks + specs Read、promptSuffix (findings) を context 化
- [ ] 2.3 Worktree で tasks 実装、既存 `ithy-opsx-apply` の "implement + commit" pattern に沿う
- [ ] 2.4 実装できない (schema 違反、dependency 不足) 時は escalate 呼ぶ

## 3. Documentation

- [ ] 3.1 `docs/2026-07-11-manager-usage-and-agents-migration.md` 新規:
  - Manager 起動方法 (手動 `/opsx:manage <id>`)
  - agents.yaml に review-claude / verify-claude / code-claude を追加する例
  - runtimes.claude runtime 定義例
  - 移行 timeline

- [ ] 3.2 `docs/ideas/2026-07-11-manager-max-iterations-config.md` — agents.yaml に `manager.maxIterations` field を追加する idea

- [ ] 3.3 `docs/ideas/2026-07-11-verify-command-per-project.md` — Phase 4.1 の Fable MEDIUM #6 対応、agents.yaml で verify command 上書き

## 4. Spec delta

- [ ] 4.1 `openspec/changes/add-manager-loop-skill/specs/dashboard/spec.md` に 2 ADDED requirements:
  - **Manager Loop Slash Command** — /opsx:manage の contract
  - **Code Worker Slash Command** — /opsx:code の contract

- [ ] 4.2 `npm run openspec -- validate add-manager-loop-skill` VALID

## 5. Manual verification

- [ ] 5.1 現行 agents.yaml に review-claude / verify-claude / code-claude を手書き追加 (test project で) — DEFERRED
- [ ] 5.2 dev server 起動 + `/opsx:manage <id>` を PTY で叩き、loop が回ることを確認 — DEFERRED
- [ ] 5.3 needs-rework path (review が rework 返す) の loop 収束を確認 — DEFERRED

## 6. Verification

- [ ] 6.1 `npm test && npm run typecheck && npm run build` clean (code 変更なし、234 tests 維持)

## 7. Post-impl

- [ ] 7.1 phase-workflow へ merge — merge step で
- [ ] 7.2 archive → phase-workflow に archive commit — archive step で
- [ ] 7.3 Phase 4 完了、次: Phase 3+4 → main の大 merge or Phase 5.1
