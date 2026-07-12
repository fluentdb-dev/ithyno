## 1. AgentConfigModal component

- [ ] 1.1 New `web/src/components/AgentConfigModal.tsx` — controlled modal with name (disabled on edit) / role dropdown / shape toggle (legacy | runtime-backed) / runtime dropdown / command + args / prompt (textarea) / specialties (comma-separated) / concurrency (number) / dedicated (checkbox)
- [ ] 1.2 Local form state via `useState`; validation on submit (name kebab-case, concurrency ≥ 1); error inline per field
- [ ] 1.3 Save button posts to `/api/agents/config`; on 404 shows a toast with a "5.3 not landed" hint and keeps the modal open

## 2. Delete confirmation

- [ ] 2.1 Reuse existing `CommandModal` or a small inline dialog for "Delete agent `<name>`?" — Confirm posts delete-shaped request, Cancel closes

## 3. Agents.tsx wiring

- [ ] 3.1 `AgentRow` gains `Edit` + `Delete` buttons in the row's action slot
- [ ] 3.2 Below the Configured (idle) section: `+ Add agent` button (hidden when `agentConfigError` is present)
- [ ] 3.3 `useState` for `editingAgent: AgentPublic | "new" | null` — drives modal open/close and prefill

## 4. API client

- [ ] 4.1 `web/src/api.ts` gets `saveAgentConfig(next: AgentConfigPayload)` — POST /api/agents/config; returns parsed error body on non-200
- [ ] 4.2 `deleteAgent(name: string)` — POST /api/agents/config with delete shape; same error handling

## 5. Types

- [ ] 5.1 `web/src/types.ts` gains `AgentConfigPayload` (client mirror of the write shape 5.3 will accept)

## 6. CSS

- [ ] 6.1 `.agent-config-modal` + form-field classes in `web/src/styles.css`
- [ ] 6.2 `.agent-row-actions` for the Edit / Delete buttons

## 7. Spec deltas

- [x] 7.1 3 ADDED requirements in `specs/dashboard/spec.md`
- [ ] 7.2 `npm run openspec -- validate add-agents-config-ui` VALID

## 8. Tests

- [ ] 8.1 Modal form validation unit test — kebab-case name / concurrency ≥ 1 / shape toggle hides the inactive fields
- [ ] 8.2 Save-on-404 toast surfaces the endpoint hint

## 9. Verification

- [ ] 9.1 `npm test && npm run typecheck && npm run build` clean

## 10. Post-impl

- [ ] 10.1 phase-workflow へ merge (worktree flow)
- [ ] 10.2 archive → phase-workflow に archive commit
- [ ] 10.3 Manual smoke deferred until Phase 5.3 lands the write endpoint
