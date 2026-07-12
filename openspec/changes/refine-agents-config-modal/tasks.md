## 1. In-flight spec 注記 (CLAUDE.md hard rule)

- [x] 1.1 Added `> ⚠️ **PENDING MODIFICATION** by [refine-agents-config-modal](...)` blockquote under `### Requirement: Manager Role In agents.yaml` in `openspec/specs/dashboard/spec.md`

## 2. Server: loader singleton

- [x] 2.1 `server/agents/registry.ts::validateAgents` rejects the second `role: manager` entry with `only one role: manager entry is allowed (first at agents[i])` naming both indexes
- [x] 2.2 Extended `server/agents/registry.test.ts` — 4-manager singleton case now asserts load failure with error naming `agents[1]`

## 3. Server: writer guards

- [x] 3.1 `server/agents/config-writer.ts::applyAgentConfigPayload`:
  - `action: delete` on a manager-role entry → `{ ok: false, status: 400, error: "manager agents cannot be deleted from the UI; edit agents.yaml directly to remove" }`
  - `action: upsert` with `role: manager` whose name differs from any existing manager entry → `{ ok: false, status: 400, error: "only one role: manager entry is allowed" }`
  - Editing the existing manager (same name) — allowed
- [x] 3.2 `config-writer.test.ts` — 4 new tests: delete-manager rejected, upsert second manager rejected, upsert existing manager allowed, initialInput round-trip

## 4. Client: Modal initialInput field

- [x] 4.1 `AgentConfigModal.tsx`:
  - Added `initialInput` textarea (2 rows) below the shape fields
  - Placeholder switches on `form.role`: manager → `/opsx:manage`, code → `/ithy-opsx:apply ${change_id}`, else → generic
  - On Save, `initialInput` is included only when the trimmed value is non-empty
- [x] 4.2 `web/src/types.ts::AgentConfigPayload` upsert variant: added optional `initialInput?: string`
- [x] 4.3 `server/agents/config-writer.ts`: `coercePayload` accepts optional `initialInput`; `renderAgentYamlEntry` emits it when set

## 5. Client: Modal manager-role rules

- [x] 5.1 `AgentConfigModal.tsx`:
  - New prop `existingManagerName: string | null`
  - Add-mode: filters `manager` out of `ROLE_OPTIONS` when `existingManagerName !== null`
  - Edit-mode (editing the manager itself): keeps `manager` selectable via `isEditingManager`
  - When `form.role === "manager"`, auto-forces `form.shape = "legacy"` and disables the runtime radio with an inline hint

## 6. Client: hide Delete on manager row

- [x] 6.1 `Agents.tsx::AgentRow`: `canDelete = agent.role !== "manager"`; Delete button rendered only when true
- [x] 6.2 `Agents.tsx` passes `existingManagerName` down to the Modal (computed from the loaded agents list)

## 7. Tests (client-side)

- [ ] 7.1 `AgentConfigModal.test.ts` — not extended in this pass; the existing 7-case kebab-case suite still passes. UI-level tests for placeholder / role gating would need jsdom or Playwright; deferred to a separate test-infra change

## 8. Spec deltas

- [x] 8.1 1 MODIFIED + 3 ADDED requirements in `specs/dashboard/spec.md`
- [x] 8.2 `npm run openspec -- validate refine-agents-config-modal` VALID

## 9. Verification

- [x] 9.1 `npm test && npm run typecheck && npm run build` clean (269 → 273 tests, +4)

## 10. Post-impl

- [x] 10.1 phase-workflow へ merge (worktree flow) — via merge step
- [x] 10.2 archive → phase-workflow に archive commit — via archive step
- [ ] 10.3 rebuild dist so the UI on :55910 picks up the new bundle — user step
