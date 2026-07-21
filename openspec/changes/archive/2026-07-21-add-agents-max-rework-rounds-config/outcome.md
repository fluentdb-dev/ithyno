# Outcome: add-agents-max-rework-rounds-config

## Worked

- Added `maxReworkRounds: number` to `AgentConfig` (both union arms) and wired it through `load()`, the no-file branch, the error branch, and `publicConfig()` cleanly.
- `validateMaxReworkRounds` implements the clamp+warn semantics as specified: non-numeric → default 5, float → floor, out-of-range → clamp to [1, 10]. All 6 test cases (default, valid, 0→1, 11→10, float, non-numeric string) pass.
- Client type `AgentConfigResponse` in `web/src/types.ts` updated with `maxReworkRounds: number` alongside `maxParallel`.
- Both skill docs updated: `MAX_ITERATIONS` replaced by `MAX_REWORK_ROUNDS` with an awk snippet showing how to read it from `agents.yaml`, fallback to 5, and a note that the cap is per-change in dispatch-multi.
- `npm run openspec -- validate add-agents-max-rework-rounds-config --strict`, `npm test` (304 total / 0 failures), `npm run typecheck`, and `npm run build` all pass in the worktree.

## Surprises

- `validateMaxParallel` in the existing code **throws** on out-of-range/non-integer values (not clamp+warn). The proposal text said "matching `maxParallel`'s handling" but the tasks spelled out clamp+warn semantics explicitly. Chose clamp+warn per the explicit task spec, making `validateMaxReworkRounds` purposefully different from `validateMaxParallel`.
- The `spawn-options-writer.test.ts` has both a `cfg()` helper and one direct `AgentConfig` literal (the `syncSpawnOptions` no-op test). Both needed `maxReworkRounds` added.
- The `AgentConfig` type cast in the `cfg()` helper needed a `(partial as { maxReworkRounds?: number })` cast because `Partial<AgentConfig>` on a union type doesn't readily expose `maxReworkRounds` without it.

## Differently

- Could have made `validateMaxReworkRounds` throw (mirroring `validateMaxParallel` exactly) and updated the test cases to check `ok: false`. The spec says "clamped to the bounds with a warning" which is the more user-friendly behavior, so clamp+warn was the right call.
- The constants (`DEFAULT_MAX_REWORK_ROUNDS`, `MAX_REWORK_ROUNDS_MIN`, `MAX_REWORK_ROUNDS_MAX`) are exported so tests or other consumers can reference them without hardcoding `5 / 1 / 10`.

## Follow-ups

- **Per-role override**: `agents[i].maxReworkRounds` could override the top-level default for a specific agent/role combination. Deferred — top-level covers the common case and per-role adds complexity.
- **UI settings panel**: The `maxReworkRounds` value is surfaced via `GET /api/agents/config` but not yet shown in the Agents tab alongside `maxParallel`. A follow-up could add it to the config display and possibly an edit field.
- **Expose in `agents.yaml.example`**: Documenting `maxReworkRounds` in the example file alongside `maxParallel` would help new users discover the field.
