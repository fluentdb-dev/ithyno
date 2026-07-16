# Tasks — wire-role-to-cli-in-manager-skill

Impl is phased. **Phase 1** lands with this change; **Phase 2** is
spec-only in this change — impl is tracked in a follow-up change
(id TBD, likely `impl-skill-driven-worktree-and-cli`) that this
propose links to via `## Next follow-up` below.

---

## Phase 1 — UI walk-back (impl now)

### 1. Simplify Start flow

- [x] 1.1 `web/src/hooks/useStartFlow.tsx`: `startImplementation` を
  「常に `startTerminalFlow` を呼ぶ」に単純化 — parallelExecution
  分岐、override 分岐、worktree 前提チェック全撤去
- [x] 1.2 同上: `startWorktreeFlow`, `commitAndStart`, `agentPicker`
  / `uncommittedPending` / `openGitPanel` state を削除
- [x] 1.3 同上: `startFlowModals` から AgentPickerModal /
  UncommittedProposalModal / GitIdentityModal 撤去 (CommandModal のみ残す)
- [x] 1.4 同上: unused imports 掃除 (`selectStartAgent`,
  `commitChangeProposal`, `fetchChangeGitState`, `runAgent`,
  `AgentPickerModal`, `UncommittedProposalModal`, `GitIdentityModal`)

### 2. Delete UI-only worktree helpers

- [x] 2.1 `web/src/components/AgentPickerModal.tsx`: delete
- [x] 2.2 `web/src/components/UncommittedProposalModal.tsx`: delete
- [x] 2.3 `web/src/util/selectStartAgent.ts` + `selectStartAgent.test.ts`:
  delete
- [x] 2.4 CSS: `.agent-picker`, `.uncommitted-proposal-modal` 等の
  orphan class を `web/src/styles.css` から削除
- [x] 2.5 その他呼び出し元 grep — 残っている import が無いことを確認
  (`ParallelStartLauncher.tsx` は comment 更新のみで実質変更なし)

### 3. Verify

- [x] 3.1 `npm run typecheck` clean
- [x] 3.2 `npm test` clean (21 files / 211 pass / 1 skip; 7 tests 減 =
  削除した selectStartAgent tests)
- [x] 3.3 `npm run build` clean (CSS 44.37→43.26 kB / JS 811→805 kB)
- [x] 3.4 `openspec validate wire-role-to-cli-in-manager-skill --strict`
  VALID
- [x] 3.5 手動 (Puppeteer): Kanban Start で `add-agent-process-detach`
  を Start → `Apply this change` modal 出現、`/opsx:apply
  add-agent-process-detach` プレフィル、AgentPickerModal 出ず、
  worktree spawn なし (screenshot: `/tmp/kanban-verify-after-start.png`)
- [x] 3.6 手動 (Puppeteer): `parallelExecution: true` のまま Kanban
  Start → CommandModal のみ、`POST /api/agents/run` 呼び出しなし
- [x] 3.7 手動 (Puppeteer): `agents.yaml` を `agents: []` にしても
  23 change 全ての Start ボタンが `disabled: false, hidden: false`
  で表示され、ParallelStartLauncher も `Start ▾ (23)` で enabled

### 4. Post-impl (Phase 1)

- [x] 4.1 outcome.md
- [x] 4.2 `docs/ideas/2026-07-16-wire-role-to-cli-in-manager-skill.md`
  の frontmatter を `status: promoted` にし、`promoted_to` に本 change
  を追記
- [ ] 4.3 `/ithy-opsx:archive wire-role-to-cli-in-manager-skill`

---

## Phase 2 — Skill impl (deferred to follow-up change)

**⚠️ Not implemented in this change. Spec deltas capture the target
contract; a separate propose (`impl-skill-driven-worktree-and-cli`
or similar) will land the code changes below.**

- [ ] `.claude/commands/opsx/manage.md`: rewrite dispatch to read
  `agents.yaml` and branch `command == "claude" → Task tool` /
  `others → subprocess -p`
- [ ] `.claude/commands/opsx/apply.md`: extend to read
  `parallelExecution` and do `git worktree add` when true
- [ ] `.claude/commands/opsx/review.md`, `verify.md`: minor prompt
  tweaks to align with the CLI-agnostic template
- [ ] `AGENTS.md`: new file, code / review / verify worker contract
- [ ] `.github/copilot-instructions.md`: new file, same contract
- [ ] 3-stage success 判定を skill 本文に明文化
- [ ] Verify: `/opsx:manage add-dummy-tab` で code (claude Task tool)
  → review (copilot subprocess or agy subprocess) → verify chain が
  回ることを手動観察

## Next follow-up

Track Phase 2 as a fresh propose after this change archives. The idea
file (`docs/ideas/2026-07-16-wire-role-to-cli-in-manager-skill.md`)
already captures the Copilot / Antigravity Q&A that Phase 2 depends
on.
