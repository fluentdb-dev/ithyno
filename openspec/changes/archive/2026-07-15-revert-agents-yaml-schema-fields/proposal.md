---
tags: [feature/revert, area/server, area/web, runtime-collapse, schema-slim]
---

# Revert add-agent-role-field (specialties + concurrency portion)

## Why

R8 of the runtime-collapse pivot. `add-agent-role-field` は role +
specialties + concurrency + dedicated の 4 metadata field を追加した
(dedicated は R5 で撤去済み)。R1 で dispatch endpoint 撤去、Manager loop も
skill 側に移った今、**specialties (weighted matching 用) と concurrency
(job cap 用) は使用箇所ゼロ**。撤去して schema を slim 化する。

`role` (今は `roles[]`) は skill dispatch judgment に必要なので残す。

## Targets

All Case α — partial revert.

1. **`add-agent-role-field`** (`2026-07-05-add-agent-role-field`, Case α,
   PARTIALLY REVERTED): 3 requirements 全 REMOVE。roles[] の存在自体は
   後続 `reshape-agents-yaml-mode-roles` が別 requirement で担保しており、
   本 revert で `roles` が消えるわけではない。

## What Changes

### Spec (REMOVED — 3 requirements in agent-runner)

- `Agent Role Metadata Fields`
- `Agent Metadata Validation`
- `Metadata Fields Are Inert`

### Impl

- `server/agents/registry.ts` — AgentDef から `specialties` / `concurrency`
  field 削除、`normalizeAgent` の該当 parse ロジック + KNOWN_AGENT_KEYS 撤去
- `web/src/types.ts` — AgentPublic + AgentConfigPayload から
  `specialties` / `concurrency` 撤去
- `web/src/components/AgentConfigModal.tsx` — Specialties input +
  Concurrency 表示 (現在 hidden だが FormState と render 分岐が残存) 撤去
- `web/src/pages/Agents.tsx` — AgentRow の specialties badge 撤去
- `agents.yaml` — 全 agent の `specialties: []` + `concurrency: N` 削除
- Test: registry.test.ts / config-writer.test.ts の specialties/concurrency fixture patch

## Case α revert validity

target archived、3 requirements landed。REMOVED delta で agent-runner spec
から抹消。`roles[]` は reshape-agents-yaml-mode-roles が別途 landed して
おり無傷。

## Blast radius

- **Server**: parse ロジック + type field 撤去 (~30 LOC)
- **UI**: Modal の Specialties input + Agent row の specialties badge 撤去
- **Test**: fixture patch 多数
- **agents.yaml**: 全 agent (3 個) の `specialties: []` + `concurrency: N` 削除

## Out of scope

- Manager 特別扱い — R9
- `roles[]` field — keep
