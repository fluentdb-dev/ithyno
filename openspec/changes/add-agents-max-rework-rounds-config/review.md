---
verdict: pass
reviewer: manager-hand-review
reason: copilot policy error persisting; Manager fallback per updated dispatch skill
---

# Review: add-agents-max-rework-rounds-config

## Findings
- no blocking issues found

## Verdict rationale

Implementation mirrors `maxParallel` faithfully per proposal + spec:

- **`server/agents/registry.ts`**:
  - `AgentConfig.maxReworkRounds: number` added to the union.
  - Exported constants `DEFAULT_MAX_REWORK_ROUNDS=5`, `MAX_REWORK_ROUNDS_MIN=1`, `MAX_REWORK_ROUNDS_MAX=10` per Requirement's stated defaults + range.
  - `validateMaxReworkRounds()` mirrors `validateMaxParallel`'s clamp-on-out-of-range + fallback-to-default-on-non-numeric + warn semantics — covers all 4 spec scenarios (Default absent, Valid in range, Out-of-range clamped, Non-numeric fallback).
  - Wired through `load()` all 3 branches + `publicConfig()` — spec's "Client can read the config" scenario satisfied.
- **`server/agents/registry.test.ts`** — 6 new tests: default, valid, `0`→1 clamp, `11`→10 clamp, float handling, non-numeric fallback. All 4 spec scenarios covered + edge cases.
- **`spawn-options-writer.test.ts`** — fixture updated with `maxReworkRounds: 5` to avoid TypeScript incompatibility.
- **`web/src/types.ts`** — `AgentConfigResponse` gains `maxReworkRounds` field for client consumption.
- **Skill docs** — both `dispatch.md` and `dispatch-multi/SKILL.md`:
  - Constants section renamed `MAX_ITERATIONS` → `MAX_REWORK_ROUNDS` with clear naming.
  - `awk` snippet reading `maxReworkRounds` from agents.yaml + fallback to 5 documented — spec's "Dispatch skill reads the resolved value" scenario satisfied.
  - Cross-reference to `maxParallel` added in dispatch-multi.
- All automated checks pass: 303 tests, typecheck clean, build clean, openspec validate --strict pass.

Change is ready to archive.
