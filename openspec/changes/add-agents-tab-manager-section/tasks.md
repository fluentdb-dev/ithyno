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
- [ ] 8.2 UI: a **Manager** section appears on the Agents tab between Runtimes and Live
- [ ] 8.3 UI: with no `role: manager` in agents.yaml and the Terminal panel open, the section shows the Not-configured state (`Manager (not configured in agents.yaml): claude --continue` + explanation + `[Declare in agents.yaml]` button)
- [ ] 8.4 UI: clicking `[Declare in agents.yaml]` opens the AgentConfigModal in Add mode with role prefilled to `manager`, command=`claude`, args=`[--continue]`, and the `name` field empty and editable
- [ ] 8.5 UI: entering a name and saving switches the Manager section to the Declared state (single row, Edit only, no Delete)
- [ ] 8.6 UI: the declared manager disappears from the Configured (idle) list (filter is active)
- [ ] 8.7 UI: closing every Terminal panel leaves the section in the Idle state (`No manager declared. Opening a change view launches the Terminal panel...`)
- [ ] 8.8 UI: setting `ITHYNO_TERMINAL_STARTUP=aider` and restarting the server makes `resolvedStartup` = `aider` and the explanation = `Currently running the command from ITHYNO_TERMINAL_STARTUP.`
- [ ] 8.9 API: a `curl` to `/api/manager/status` from a non-loopback address returns 403

## 9. Post-impl

- [x] 9.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 9.2 archive → user runs `/ithy-opsx:archive` after confirming 8.2–8.9
- [x] 9.3 rebuild dist so the UI on :55910 picks up the new bundle — via post-archive build
- [ ] 9.4 puppeteer verify — supplement 8.2–8.9 with an automated screenshot pass after the user confirms
