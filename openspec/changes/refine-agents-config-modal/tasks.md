## 1. In-flight spec 注記 (CLAUDE.md hard rule)

- [ ] 1.1 Add `> ⚠️ **PENDING MODIFICATION** by [refine-agents-config-modal](...)` under `### Requirement: Manager Role In agents.yaml` in `openspec/specs/dashboard/spec.md`

## 2. Server: loader singleton

- [ ] 2.1 `server/agents/registry.ts::validateAgents`: reject the second `role: manager` entry with an error naming its index; message points at "only one role: manager entry is allowed"
- [ ] 2.2 Extend `server/agents/registry.test.ts` with the multi-manager rejection case

## 3. Server: writer guards

- [ ] 3.1 `server/agents/config-writer.ts::applyAgentConfigPayload`:
  - `action: delete` on a manager-role entry → `{ ok: false, status: 400, error: "manager agents cannot be deleted from the UI; edit agents.yaml directly to remove" }`
  - `action: upsert` with `role: manager` whose name differs from any existing manager → `{ ok: false, status: 400, error: "only one role: manager entry is allowed" }`
  - Editing the existing manager (same name) → allowed
- [ ] 3.2 Extend `server/agents/config-writer.test.ts` with 3 cases: delete-manager rejected, upsert second manager rejected, upsert existing manager allowed

## 4. Client: Modal initialInput field

- [ ] 4.1 `web/src/components/AgentConfigModal.tsx`:
  - Add `initialInput` field (textarea, single-line growable) to the form state, seeded from the agent's existing value
  - Placeholder switches on `form.role`: `manager` → `/opsx:manage`, `code` → `/ithy-opsx:apply ${change_id}`, else → generic
  - On Save, include `initialInput` in the payload only when the trimmed value is non-empty
- [ ] 4.2 `web/src/types.ts::AgentConfigPayload` upsert variant: add optional `initialInput?: string`
- [ ] 4.3 Server writer: `coercePayload` accepts optional `initialInput`; `renderAgentYamlEntry` emits it when set

## 5. Client: Modal manager-role rules

- [ ] 5.1 `web/src/components/AgentConfigModal.tsx`:
  - Prop `existingManagerName: string | null` from the parent (`Agents.tsx`)
  - Add-mode: if `existingManagerName !== null`, filter `manager` out of `ROLE_OPTIONS`
  - Edit-mode: keep `manager` selectable
  - When form.role === "manager", auto-set `form.shape = "legacy"` and disable the `runtime` radio with a hint

## 6. Client: hide Delete on manager row

- [ ] 6.1 `web/src/pages/Agents.tsx::AgentRow`:
  - Compute `canDelete = agent.role !== "manager"`
  - Render Delete button only when `canDelete`
- [ ] 6.2 Pass `existingManagerName` down to the Modal (compute in Agents.tsx from the loaded agents list)

## 7. Tests (client-side)

- [ ] 7.1 `web/src/components/AgentConfigModal.test.ts` — extend with regex-covered cases: placeholder switches by role; empty initialInput not sent

## 8. Spec deltas

- [x] 8.1 1 MODIFIED + 3 ADDED requirements in `specs/dashboard/spec.md`
- [ ] 8.2 `npm run openspec -- validate refine-agents-config-modal` VALID

## 9. Verification

- [ ] 9.1 `npm test && npm run typecheck && npm run build` clean

## 10. Post-impl

- [ ] 10.1 phase-workflow へ merge (worktree flow)
- [ ] 10.2 archive → phase-workflow に archive commit
- [ ] 10.3 rebuild dist so the UI on :55910 picks up the new bundle
