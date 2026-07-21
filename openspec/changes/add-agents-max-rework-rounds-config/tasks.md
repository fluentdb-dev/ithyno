# Tasks

## 1. Registry — types + constants + validation

- [x] 1.1 In `server/agents/registry.ts`, add `maxReworkRounds: number` to the `AgentConfig` type/interface (top-level, sibling of `maxParallel`).
- [x] 1.2 Add constants `DEFAULT_MAX_REWORK_ROUNDS = 5`, `MAX_REWORK_ROUNDS_MIN = 1`, `MAX_REWORK_ROUNDS_MAX = 10`.
- [x] 1.3 Add `validateMaxReworkRounds(value: unknown): number` mirroring `validateMaxParallel`:
  - non-numeric / missing → return default 5 + log warn
  - integer in range → return as-is
  - integer out of range → clamp to nearest bound + log warn
  - float → floor or round (match `validateMaxParallel`'s choice) + log warn
- [x] 1.4 In `load()`, extract `maxReworkRounds` from the parsed YAML and pass through `validateMaxReworkRounds`. Store on the AgentConfig instance.
- [x] 1.5 Ensure `publicConfig()` (the client-facing DTO) includes `maxReworkRounds`.

## 2. Registry tests

- [x] 2.1 Extend `server/agents/registry.test.ts` with tests mirroring the `maxParallel` cases:
  - Default when field absent (returns 5)
  - Valid integer in range (returns as-is)
  - `0` clamps to 1
  - `11` clamps to 10
  - Float `5.7` handled per validator's rule
  - Non-numeric `"five"` returns 5 (default)
- [x] 2.2 Update any fixture test files (e.g., `spawn-options-writer.test.ts`) whose `AgentConfig` mocks are missing the new field. Add `maxReworkRounds: 5` (or the default) to each fixture.

## 3. Client types

- [x] 3.1 Add `maxReworkRounds: number` to `AgentConfigResponse` in `web/src/types.ts`.

## 4. Skill documentation

- [x] 4.1 `.claude/commands/ithy-opsx/dispatch.md`:
  - Rename occurrences of `MAX_ITERATIONS` in prose to reference `maxReworkRounds` from agents.yaml.
  - Update the Constants section to describe reading the value from `agents.yaml` (same awk pattern used for `agmsg.team` and `maxParallel`) with fallback to 5.
  - Keep the numeric literal 5 as the documented default and range mention `[1, 10]`.
- [x] 4.2 `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`:
  - Same treatment. Constants section notes that the cap is **per-change** in multi-dispatch, not per-invocation.
  - Add cross-reference to `maxParallel` (both live at agents.yaml top-level).

## 5. Regression tests

- [x] 5.1 `npm test` passes after the registry + fixture updates.
- [ ] 5.2 Manually confirm by editing agents.yaml to `maxReworkRounds: 3`, restarting `npm run dev`, and inspecting `/api/agents/config` — the response includes `maxReworkRounds: 3`.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate add-agents-max-rework-rounds-config --strict` passes.
- [x] 6.2 `npm test` passes.
- [x] 6.3 `npm run typecheck` passes.
- [x] 6.4 `npm run build` passes.
- [ ] 6.5 Manual: edit `agents.yaml` to `maxReworkRounds: 3`, run `/ithy-opsx:dispatch <id>` on a real change, observe the rework loop escalates at round 3 (not 5).
- [ ] 6.6 Manual: remove the field, restart, run again — falls back to 5 rounds (current behavior preserved).
- [ ] 6.7 Manual: set `maxReworkRounds: 0` and `maxReworkRounds: 15`. Confirm each is clamped to `1` and `10` respectively with a warning in the server log.
- [x] 6.8 Write `openspec/changes/add-agents-max-rework-rounds-config/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups: consider per-role overrides (e.g., `agents[].maxReworkRounds` overriding the top-level); consider exposing the field in a UI settings panel.
