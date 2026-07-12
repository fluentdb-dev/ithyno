## 1. Server: /api/manager/status

- [x] 1.1 `server/index.ts`: GET handler with `isLocal` gate; response shape per spec (agentEntry / resolvedStartup / initialInput / fallbackSource / terminalActive)
- [x] 1.2 `fallbackSource` derived locally (managerAgent → env → default)
- [x] 1.3 `activeTerminalCount()` for `terminalActive`
- [ ] 1.4 No handler-level test added — this is a plain GET with static shape; the ptyStartup fallback chain is already covered by `pty.test.ts` (7 cases). Handler is thin glue.

## 2. Client: types + API + store

- [x] 2.1 `web/src/types.ts`: `ManagerStatus` type
- [x] 2.2 `web/src/api.ts`: `fetchManagerStatus()`
- [x] 2.3 `web/src/store.ts`: `managerStatus` + `managerStatusError` state, `loadManagerStatus` action

## 3. Client: ManagerSection component

- [x] 3.1 `web/src/pages/Agents.tsx::ManagerSection` handles the 3 states (Declared / Fallback / Idle) + loading placeholder
- [x] 3.2 Placed between the RuntimesSection and the Live section
- [x] 3.3 Declared state: Edit button opens the modal with the manager as seed
- [x] 3.4 Fallback state: [Declare in agents.yaml] button opens the modal in Add mode with prefilled command/args/initialInput/role via `addModePrefill`

## 4. Client: Configured filter

- [x] 4.1 `idleAgents` now filters out `a.role === "manager"` so a declared Manager only appears in the Manager section

## 5. Modal seed enhancement (prefill for Declare button)

- [x] 5.1 `AgentConfigModal.tsx`: new optional prop `addModePrefill?: AgentPublic | null`. When `seed === "new"` AND `addModePrefill` is set, `deriveInitialForm(addModePrefill)` fills the form but the name field stays empty + editable (users pick the name)
- [x] 5.2 Existing behavior preserved when `addModePrefill` is null or undefined

## 6. CSS

- [x] 6.1 `.manager-section`, `.manager-startup`, `.manager-fallback-card` in `web/src/styles.css`

## 7. Spec deltas

- [x] 7.1 2 ADDED requirements in `specs/dashboard/spec.md`
- [x] 7.2 `npm run openspec -- validate add-agents-tab-manager-section` VALID

## 8. Verification

- [x] 8.1 `npm test && npm run typecheck && npm run build` clean (273 tests unchanged)
- [ ] 8.2 UI 手動確認 (user, サーバー再起動が必要 — 新 endpoint /api/manager/status):
  - [ ] a. Agents タブに **Manager section** が Runtimes と Live の間に出現
  - [ ] b. `agents.yaml` に `role: manager` 無し + Terminal panel 開いている場合: Not-configured 状態 (`Manager (not configured in agents.yaml): claude --continue` + explanation + `[Declare in agents.yaml]` button)
  - [ ] c. `[Declare in agents.yaml]` クリック → AgentConfigModal が Add mode で開く。role が `manager` prefill、command=`claude`、args=`[--continue]`、name field は空 (editable)
  - [ ] d. name を入力 → Save → Manager section が Declared 状態に切替 (row 表示、Edit only、Delete 無し)
  - [ ] e. Configured (idle) section から declared manager が **消えている** (フィルタ効いてる)
  - [ ] f. Terminal panel を全部閉じる → Idle 状態のメッセージ表示 (`No manager declared. Opening a change view launches the Terminal panel...`)
  - [ ] g. 環境変数 `ITHYNO_TERMINAL_STARTUP=aider` を設定してサーバー再起動 → Not-configured 状態の resolvedStartup が `aider`、explanation が `Currently running the command from ITHYNO_TERMINAL_STARTUP.`
  - [ ] h. curl で non-loopback から `/api/manager/status` → 403

## 9. Post-impl

- [x] 9.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 9.2 archive → user が 8.2 を確認後に実施
- [x] 9.3 rebuild dist so the UI on :55910 picks up the new bundle — via post-archive build
- [ ] 9.4 puppeteer verify — user 確認後に自動セットで補完
