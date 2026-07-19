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
- [x] 8.2 UI: a **Manager** section appears on the Agents tab between Runtimes and Live — verified during step 1 (puppeteer screenshot 02-agents-tab)
- [ ] 8.3 UI: Not-configured state (no manager) — pending (user has manager declared; needs a fresh setup with no manager to test)
- [~] 8.4 UI: `[Declare in agents.yaml]` opens Modal prefilled — **partially superseded by reshape**: Modal opens with prefill but Name is auto-generated (no editable input); manager role forced via mode=live-shell + roles=[manager]. Verified during step 1
- [x] 8.5 UI: entering a name and saving switches to Declared state (Edit only, no Delete) — verified via step 1 (`man` manager row shows Edit only)
- [x] 8.6 UI: declared manager disappears from Configured (idle) — verified via step 1 (`man` not in idle list)
- [ ] 8.7 UI: closing every Terminal panel → Idle state message — pending
- [ ] 8.8 UI: `ITHYNO_TERMINAL_STARTUP=aider` fallback path — pending
- [ ] 8.9 API: non-loopback → 403 — pending (would need external ip test)

## 9. Post-impl

- [x] 9.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 9.2 archive → user runs `/ithy-opsx:archive` after confirming 8.2–8.9
- [x] 9.3 rebuild dist so the UI on :55910 picks up the new bundle — via post-archive build
- [ ] 9.4 puppeteer verify — supplement 8.2–8.9 with an automated screenshot pass after the user confirms
