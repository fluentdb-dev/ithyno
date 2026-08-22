---
tags: [feature/dispatch, feature/manager, area/skills, cli/codex]
---

## Why

The dispatcher still treats Codex as lacking native child-agent support, even though current Codex CLI releases expose stable multi-agent collaboration tools. This stale assumption forces same-CLI Codex workers through AgentRunner subprocesses and makes the generated dispatch skill contradict the runtime capability it should use.

## What Changes

- Recognize current Codex Managers as having a native subagent adapter and route eligible Codex-to-Codex workers through Codex collaboration tools.
- Preserve the existing launch priority: live-shell/agmsg first, same-CLI native delegation second, and AgentRunner subprocess fallback otherwise.
- Require native Codex delegation to pass the resolved worker prompt, exact execution root, artifact path contract, and rework findings, then wait for the worker before stage judgment.
- Translate a Codex worker's `-m` / `--model` intent into the native `spawn_agent.model` field. Fall back to AgentRunner only for process-only configuration the native adapter cannot reproduce.
- Update the Claude-authoritative dispatch skill, Codex rendering, generated copies, routing tests, and drift guards so they share the same Codex capability contract.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `agent-runner`: treat supported Codex Managers as native child-agent hosts while preserving fallback behavior and worker contracts.
- `cross-cli-skill-installer`: render Codex dispatch instructions using Codex collaboration tools rather than a subprocess-only claim.

## Impact

- `server/agents/registry.ts` and its routing tests.
- `ithyno/skills/ithy-opsx-dispatch/SKILL.md`, CLI-specific renderers, and generated dispatch copies.
- Skill-renderer and initialization drift tests.
- Existing Codex subprocess behavior remains available for cross-CLI routing, unavailable collaboration tools, and process-only worker configuration.
