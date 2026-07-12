## 1. Server: /api/manager/status

- [ ] 1.1 `server/index.ts`: GET handler with `isLocal` gate; response shape per spec (agentEntry / resolvedStartup / initialInput / fallbackSource / terminalActive)
- [ ] 1.2 Determine `fallbackSource` by re-deriving the priority chain locally (call registry.managerAgent() first, then check `process.env.ITHYNO_TERMINAL_STARTUP`, then default)
- [ ] 1.3 Use `activeTerminalCount()` for `terminalActive`
- [ ] 1.4 Extend an existing server test (or create a small handler test) to cover the three fallback sources + 403 gate — deferred to smoke if no natural test host exists

## 2. Client: types + API + store

- [ ] 2.1 `web/src/types.ts`: `ManagerStatus` type mirroring the endpoint
- [ ] 2.2 `web/src/api.ts`: `fetchManagerStatus()` returning parsed response
- [ ] 2.3 `web/src/store.ts`: `managerStatus: ManagerStatus | null` state + `loadManagerStatus()` action + error state

## 3. Client: ManagerSection component

- [ ] 3.1 New `web/src/pages/Agents.tsx::ManagerSection` (inline or extracted) rendering the three states (Declared / Fallback / Idle) per spec
- [ ] 3.2 Placed between the Runtimes and Live sections in the render order
- [ ] 3.3 `Edit` button on Declared state opens the modal with the manager as seed
- [ ] 3.4 `[Declare in agents.yaml]` button on Fallback state opens the modal in Add mode with `role: manager` + command/args/initialInput prefilled

## 4. Client: Configured filter

- [ ] 4.1 `Agents.tsx`: `idleAgents` filter also excludes `role: manager` (so a declared Manager only appears in the Manager section, not both)

## 5. Modal seed enhancement (prefill for Declare button)

- [ ] 5.1 `AgentConfigModal.tsx`: the `seed` prop already accepts `AgentPublic | "new"`. For the Declare button, construct a synthetic `AgentPublic` from `managerStatus` (role=manager, command, args, initialInput) and pass it as seed with `isAdd=true` — but the current API narrows on `seed === "new"` for Add mode. Extend to accept a third variant `{ mode: "new"; prefill: Partial<AgentPublic> }` OR (simpler) allow a `seed: AgentPublic` in Add mode by carrying a separate `isAdd` prop.
- [ ] 5.2 Modal keeps existing behavior when `seed` is `"new"` (empty defaults) or an existing agent (Edit mode)

## 6. CSS

- [ ] 6.1 `web/src/styles.css`: `.manager-section` styling (declared row + fallback muted card + idle empty state)

## 7. Spec deltas

- [x] 7.1 2 ADDED requirements in `specs/dashboard/spec.md`
- [ ] 7.2 `npm run openspec -- validate add-agents-tab-manager-section` VALID

## 8. Verification

- [ ] 8.1 `npm test && npm run typecheck && npm run build` clean

## 9. Post-impl

- [ ] 9.1 phase-workflow へ merge (worktree flow)
- [ ] 9.2 archive → phase-workflow に archive commit
- [ ] 9.3 rebuild dist so the UI on :55910 picks up the new bundle
- [ ] 9.4 puppeteer verify: (a) Fallback state currently, (b) after declaring a manager via Modal, Manager section switches to Declared
