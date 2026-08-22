---
tags: [feature/agent-dispatch, area/reliability, role/manager]
---

## Why

Dispatch currently treats a worker that never responds and a worker that is
actively performing a long implementation as the same fixed-duration timeout.
The ambiguity produces false failures, hides the actual failure stage, and lets
CLI-native timeout defaults override ithyno's intended dispatch policy.

## What Changes

- Replace the single dispatch ceiling with distinct startup, first-activity,
  idle, hard-runtime, and artifact-grace timeout semantics.
- Define qualifying worker activity consistently across subprocess, Task-tool,
  and agmsg execution paths so active work resets idle time without extending
  the hard deadline.
- Add validated timeout defaults to `agents.yaml`, with optional per-Agent
  overrides and role-specific hard-runtime limits.
- Make the ithyno supervisor own timeout decisions; CLI-native timeout flags
  must be disabled or aligned so they cannot expire before ithyno's deadline.
- Report structured timeout reasons and apply retry/fallback behavior according
  to the timeout class instead of returning a generic timeout.
- Preserve review/verify artifact judgment with a separate bounded grace period
  after worker completion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dashboard`: Replace the fixed dispatch ceiling in the Dispatch Slash Command
  contract with layered timeout monitoring and timeout-specific recovery.
- `agent-runner`: Add timeout configuration, activity tracking, subprocess
  supervision, and structured timeout results shared by dispatch paths.

## Impact

- `agents.yaml` parsing, public Agent configuration, defaults, and validation.
- Agent subprocess supervision, job output/activity events, cancellation, and
  terminal status metadata.
- `.claude/commands/ithy-opsx/dispatch.md`, its template and universal source,
  plus equivalent Codex-rendered instructions.
- agmsg heartbeat/report contracts and adapters for CLI-native timeout flags.
- Settings/Agents diagnostics where job failure reasons are displayed.
- Deterministic fake-clock tests for every timeout boundary and execution path.
