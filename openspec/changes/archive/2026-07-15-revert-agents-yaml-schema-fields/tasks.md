# Tasks — revert-agents-yaml-schema-fields

## 1. Spec deltas

- [x] 1.1 3 REMOVED requirements in specs/agent-runner/spec.md
- [x] 1.2 validate VALID

## 2. Impl (server)

- [x] 2.1 registry.ts: AgentDef から specialties/concurrency 削除、normalizeAgent の parse ロジック撤去、KNOWN_AGENT_KEYS から除去
- [x] 2.2 config-writer.ts: UpsertPayload + coercePayload + renderAgentYamlEntry から specialties/concurrency 撤去
- [x] 2.3 registry.test.ts / config-writer.test.ts の fixture patch

## 3. Impl (UI)

- [x] 3.1 types.ts: AgentPublic + AgentConfigPayload から specialties/concurrency 撤去
- [x] 3.2 AgentConfigModal.tsx: Specialties input + FormState field 撤去
- [x] 3.3 Agents.tsx: specialties badge + ManagerSection の defaults 撤去

## 4. agents.yaml migration

- [x] 4.1 全 agent の `specialties: []` + `concurrency: N` 削除

## 5. Target archive annotations

- [x] 5.1 PARTIALLY REVERTED annotation on `2026-07-05-add-agent-role-field/proposal.md`

## 6. In-flight spec 注記

- [x] 6.1 PENDING REMOVAL on 3 target requirements (SHALL 段落の後)

## 7. Verification

- [x] 7.1 typecheck + tests + build clean

## 8. Post-impl

- [x] 8.1 phase-workflow へ merge — N/A: in-place
- [x] 8.2 outcome.md 記入
- [ ] 8.3 `/ithy-opsx:archive revert-agents-yaml-schema-fields`
