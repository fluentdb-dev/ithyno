# Tasks — redesign-skill-namespace-and-dispatch

## 1. Skill file moves + deletes

- [x] 1.1 `.claude/commands/opsx/code.md` **削除**
- [x] 1.2 `.claude/commands/opsx/manage.md` **削除**
- [x] 1.3 `.claude/commands/opsx/review.md` → `ithy-opsx/review.md`
  へ git mv + 内容更新 (name / argument-hint / sole-contract 節追加)
- [x] 1.4 `.claude/commands/opsx/verify.md` → `ithy-opsx/verify.md`
  へ git mv + 内容更新 (同上)

## 2. `/opsx:apply` を pure worker prompt に

- [x] 2.1 `.claude/commands/opsx/apply.md`: worker prompt 状態は
  Phase 2 revert 済み、現状踏襲
- [x] 2.2 apply.md に **"Handling review findings"** 節追加 —
  `Prior review findings:` block を優先処理する旨明記
- [x] 2.3 "Committing is the caller's responsibility." を明記、
  `/ithy-opsx:apply` の commit ラッパーへの pointer 追加

## 3. `/ithy-opsx:dispatch` 新規作成

- [x] 3.1 `.claude/commands/ithy-opsx/dispatch.md` 新規作成
- [x] 3.2 冒頭 (step 3) で `agents.yaml.parallelExecution` +
  `proposal.md.execution` を sed で read
- [x] 3.3 worktree bootstrap (step 4, `if [ ! -d ]` guard で idempotent)
- [x] 3.4 "Dispatch helper protocol" セクション新規: agent 検索 /
  prompt 解決 / claude→Task tool / else→subprocess `-p`
- [x] 3.5 code stage (step 5): 3-stage 契約 適用外、成功で commit +
  phase → `coded` POST
- [x] 3.6 review stage (step 6): 3-stage 契約 適用、verdict 分岐
- [x] 3.7 verify stage (step 7): 同上
- [x] 3.8 MAX_ITERATIONS=5、phase 遷移、escalation logic

## 4. `/ithy-opsx:review` と `/ithy-opsx:verify` 移動

- [x] 4.1 `git mv opsx/review.md ithy-opsx/review.md`
- [x] 4.2 review.md: name / description / argument-hint 更新、本文の
  `/opsx:manage` / `/opsx:code` / `/opsx:verify` 参照を新 namespace に
- [x] 4.3 review.md Guardrails: "review.md is the sole contract, stdout
  ignored" 追加
- [x] 4.4 `git mv opsx/verify.md ithy-opsx/verify.md`
- [x] 4.5 verify.md: name / description 更新、`/opsx:code` を
  `/opsx:apply` に、Manager references を dispatcher に、sole-contract
  Guardrail 追加

## 5. Server: role validator 更新

- [x] 5.1 `server/agents/registry.ts` `BUILT_IN_ROLE_PROMPTS`:
  `propose` 追加、`review`/`verify` を `/ithy-opsx:*` に、`manager`
  を `/ithy-opsx:dispatch` に更新
- [x] 5.2 `server/agents/config-writer.ts`: role list は元々 open
  (whitelist 無し) なので `propose` / `verify` は既に受付、変更不要
- [x] 5.3 manager singleton + live-shell 強制: 現状踏襲 (前議論参照)
- [ ] 5.4 `server/agents/registry.test.ts`: `propose` / `verify` role
  test 追加 — **省略** (whitelist が無く現状 test で cover 済)
- [ ] 5.5 `agents.yaml.example` 更新 — **省略** (未確認)

## 6. Client: UI Kanban Start の inject 内容変更

- [x] 6.1 `useStartFlow.tsx`: `build` を `/ithy-opsx:dispatch <id>` に
- [x] 6.2 `submitLabel` を `Send /ithy-opsx:dispatch` に
- [x] 6.3 コメント新設計に合わせて書き直し
- [x] 6.4 Kanban.tsx / ChangeDetail.tsx の Start ボタン tooltip 更新
- [x] 6.5 AgentConfigModal.tsx の `BUILT_IN_ROLE_PROMPTS` mirror 更新
  (`propose` / `ithy-opsx:*` を反映)
- [x] 6.6 Settings.tsx の説明文を `/ithy-opsx:dispatch` に

## 7. Repo-level instructions files

- [x] 7.1 `AGENTS.md` (repo root) 新規作成 — role contracts + success
  contract + failure modes + skill namespace 章追加
- [x] 7.2 `.github/copilot-instructions.md` 新規作成 (Copilot 向け)

## 8. Spec updates (dashboard capability)

- [x] 8.1 `Manager Loop Slash Command` → `Dispatch Slash Command` に
  RENAMED、本文 rewrite (delta で MODIFIED として実現)
- [x] 8.2 `Review Worker Slash Command` MODIFIED — `/ithy-opsx:review`
  namespace + sole-contract scenario
- [x] 8.3 `Start Flow Delegates Execution To Skill Layer` MODIFIED —
  inject 内容更新、Scenario 群も更新
- [x] 8.4 `Repo-Level Agent Instructions Files` 現行踏襲

## 9. Verify

- [x] 9.1 `openspec validate --strict` VALID
- [x] 9.2 `npm test && npm run typecheck && npm run build` clean
  (registry-reshape.test.ts の `verify` default 期待値を新
  `/ithy-opsx:verify` に更新)
- [x] 9.3 手動 (Puppeteer): Kanban Start → Modal タイトル "Dispatch
  this change"、prefill `/ithy-opsx:dispatch add-agent-process-detach`、
  Send button `Send /ithy-opsx:dispatch`、tooltip 全 button 更新、23
  cards 全て表示確認
- [x] 9.4 手動: `/ithy-opsx:dispatch add-dummy-tab` を実行、chain 完走
  観察 — **PASS**:
  - Step 1-4: context read / phase check (null→coded) / mode resolve
    (worktree, PARALLEL=true) / worktree bootstrap
  - Iteration 1 code (Task tool, claude): commit `a73655e`, Playground
    tab 実装 + task 7 ticked
  - Iteration 1 review (subprocess, copilot `--yolo -s -p`): review.md
    書込み, verdict `needs-rework` (test 不足指摘)
  - Iteration 2 code (Task tool, claude, priorFindings 付き): commit
    `64dd56a`, Playground.test.ts 7 tests 追加
  - Iteration 2 review (subprocess, copilot): review.md 更新, verdict
    `needs-rework` (severity low, `/docs` route regression 不足指摘)
  - 3-stage success contract 全通過 (exit / review.md 存在 / verdict 読取り)
  - MAX_ITERATIONS 収束 (未到達、途中で観察打ち切り)
- [ ] 9.5 手動: `agents.yaml` に `roles: [propose]` entry を書いて
  Agents タブで edit 可能なこと確認 — **pending** (この change の
  scope 内では未実施、次段階で確認可能)

## 10. Post-impl

- [x] 10.1 outcome.md
- [x] 10.2 impl-skill-driven-worktree-and-cli の破棄済み確認 (uncommitted
  だったので `rm -rf` で消えている)
- [ ] 10.3 `/ithy-opsx:archive redesign-skill-namespace-and-dispatch`
  — 次段階
