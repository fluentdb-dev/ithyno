---
tags: [agents, dispatch, config, dispatch-multi]
execution: worktree
---

## Why

The dispatch skill's rework loop cap is hardcoded as
`MAX_ITERATIONS = 5` in both `.claude/commands/ithy-opsx/dispatch.md`
and `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`. There is no
per-project way to lower it (short runs, cost control) or raise it
(patient, high-stakes work). `agents.yaml.maxParallel` already
follows the "config lives in the same YAML" pattern; adding
`maxReworkRounds` there gives symmetry and keeps all dispatch tuning
in one place.

Renaming from `MAX_ITERATIONS` → `maxReworkRounds` in the config
field name makes intent explicit: this is the code↔review rework
loop cap, not a generic iteration count.

## What Changes

- **`agents.yaml`**: new top-level optional field
  `maxReworkRounds: <int>`. Default `5`. Valid range `[1, 10]`.
  Invalid values (out-of-range, non-integer, non-numeric) are
  clamped to the bounds with a warning, matching `maxParallel`'s
  handling.

- **`server/agents/registry.ts`**:
  - Add `AgentConfig.maxReworkRounds: number`.
  - Constants `DEFAULT_MAX_REWORK_ROUNDS = 5`,
    `MAX_REWORK_ROUNDS_MIN = 1`, `MAX_REWORK_ROUNDS_MAX = 10`.
  - `validateMaxReworkRounds()` helper mirroring
    `validateMaxParallel()`.
  - Wire through `load()` and `publicConfig()` so the client can
    surface it in the Agents tab.

- **`web/src/types.ts`**: add `maxReworkRounds: number` to
  `AgentConfigResponse`.

- **Skill files** — replace hardcoded `MAX_ITERATIONS = 5`:
  - `.claude/commands/ithy-opsx/dispatch.md` Constants section:
    describe how to read `maxReworkRounds` from `agents.yaml`
    (same awk pattern as `maxParallel`), with fallback to `5` when
    the field is absent. Rename references in the doc from
    `MAX_ITERATIONS` to the new naming so the skill's language
    matches the config.
  - `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md` Constants
    section: same treatment; note that the cap is per-change (as
    today), not per-invocation.

- **Manager consumes the value at dispatch time**: when the skill
  reads `agents.yaml` for `agmsg.team` / `maxParallel` in its
  preflight, it also reads `maxReworkRounds` and uses it in place
  of the constant. If absent, defaults to 5.

## Success

- Setting `maxReworkRounds: 3` in `agents.yaml` causes both
  `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi` to escalate
  after 3 rework rounds instead of 5, on the very next invocation.
- Setting `maxReworkRounds: 10` allows longer rework loops.
- Omitting the field preserves current behavior (5 rounds).
- Out-of-range values (`0`, `11`, `-1`, `"five"`) are clamped to
  `[1, 10]` (or `5` for non-numeric) with a startup warning,
  matching `maxParallel`'s handling.
- `publicConfig()` exposes the resolved value; the Agents tab (or
  wherever agent config is displayed) shows it alongside
  `maxParallel`.
- Regression: existing 5-round default preserved for any project
  that doesn't set the field.
