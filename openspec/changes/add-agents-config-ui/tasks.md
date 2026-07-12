## 1. AgentConfigModal component

- [x] 1.1 New `web/src/components/AgentConfigModal.tsx` — controlled modal with name (disabled on edit) / role dropdown / shape toggle (legacy | runtime-backed) / runtime dropdown / command + args / prompt (textarea) / specialties (comma-separated) / concurrency (number) / dedicated (checkbox)
- [x] 1.2 Local form state via `useState`; validation on submit (name kebab-case, concurrency ≥ 1); error inline per field
- [x] 1.3 Save button posts to `/api/agents/config`; on 404 shows a toast with a "5.3 not landed" hint and keeps the modal open

## 2. Delete confirmation

- [x] 2.1 Inline `DeleteConfirmDialog` in `web/src/pages/Agents.tsx` — "Delete agent `<name>`?" — Confirm posts delete-shaped request, Cancel closes

## 3. Agents.tsx wiring

- [x] 3.1 `AgentRow` gains `Edit` + `Delete` buttons in the row's action slot
- [x] 3.2 Below the Configured (idle) section: `+ Add agent` button (hidden when `agentConfigError` is present)
- [x] 3.3 `useState` for `editing: AgentPublic | "new" | null` — drives modal open/close and prefill

## 4. API client

- [x] 4.1 `web/src/api.ts` gets `saveAgentConfig(payload)` — POST /api/agents/config; returns parsed error body on non-200, surfaces a friendly hint on 404
- [x] 4.2 Delete is expressed as `{ action: "delete", name }` through the same helper — no separate endpoint

## 5. Types

- [x] 5.1 `web/src/types.ts` gains `AgentConfigPayload` — a discriminated union on `action: "upsert" | "delete"`

## 6. CSS

- [x] 6.1 `.agent-config-modal` + form-field classes in `web/src/styles.css`
- [x] 6.2 `.agent-row-actions` for the Edit / Delete buttons; `.agents-add-btn` for the + Add button

## 7. Spec deltas

- [x] 7.1 3 ADDED requirements in `specs/dashboard/spec.md`
- [x] 7.2 `npm run openspec -- validate add-agents-config-ui` VALID

## 8. Tests

- [x] 8.1 Modal kebab-case name regex regression test (`AgentConfigModal.test.ts`) — 7 cases covering common names, uppercase / leading-digit / hyphen edge cases, empty string
- [ ] 8.2 Save-on-404 toast surface — deferred to Phase 5.3 smoke (client + server end-to-end)

## 9. Verification

- [x] 9.1 `npm test && npm run typecheck && npm run build` clean (233 → 240 tests; +7 kebab-case validation)

## 10. Post-impl

- [x] 10.1 phase-workflow へ merge (worktree flow) — via merge step
- [x] 10.2 archive → phase-workflow に archive commit — via archive step
- [ ] 10.3 Manual smoke deferred until Phase 5.3 lands the write endpoint
