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
- [x] 9.2 UI: every Configured (idle) row shows `[Edit]` and `[Delete]` buttons
- [x] 9.3 UI: a `[+ Add agent]` button appears below the Configured (idle) section — verified during step 1 (copilot-review registered via + Add)
- [~] 9.4 UI: clicking `[Edit]` opens the modal with the `name` field disabled — **superseded by reshape-agents-yaml-mode-roles**: Name input entirely removed; Edit-mode title reads `Edit agent — <name>` instead
- [x] 9.5 UI: with 5.3 landed, Save produces toast, closes the modal, and the row refreshes — verified after `fix: reload agent registry synchronously after config write` (e43b1d1) landed; before that a race left the row stale
- [~] 9.6 UI: with 5.3 NOT landed → 404 toast — **obsolete**: 5.3 has landed; the 404 path is unreachable in normal use
- [ ] 9.7 UI: clicking `[Delete]` opens a confirmation dialog `Delete agent <name>?`; Confirm removes the row — pending
- [~] 9.8 UI: clicking `[+ Add agent]` opens the modal with the `name` field editable and role defaulted to `code` — **partially superseded by reshape**: Name is auto-generated (no editable input); Roles default to `[code]` — verified during step 1
- [~] 9.9 UI: empty/UPPERCASE name → validation error — **superseded by reshape**: Name is auto-generated (auto-namer produces kebab-case). Concurrency `0` validation obsolete because Concurrency input is hidden
- [~] 9.10 UI: `Specialties` label copy — the label was updated in reshape's Modal Layout Ergonomics; verified during step 1
- [~] 9.11 UI: `Initial input` field label copy — **obsolete**: initialInput field removed by reshape (folded into per-role `prompts` textareas)

## 10. Post-impl

- [x] 10.1 phase-workflow へ merge (worktree flow) — via merge step
- [ ] 10.2 archive → user runs `/ithy-opsx:archive` after confirming 9.2–9.11
- [ ] 10.3 Manual smoke — merged into 9.2–9.9
