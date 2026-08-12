---
tags: [feature/cross-cli, area/testing, role/worker]
execution: main
---

## Why

Initialization tests can prove that a `SKILL.md` file was written, but they
cannot prove that the configured Agent CLI discovers and can use that skill.
This gap is especially important for project-local, cross-CLI installations:
a path may look correct while an actual Claude or Codex session does not list
or apply the skill.

The project needs an explicit, opt-in smoke test that selects an Agent from
`agents.yaml`, launches it through the normal runner environment, and verifies
an artifact produced by a harmless probe skill. This is test infrastructure,
not a new production dispatch stage.

## What Changes

1. Add a Claude-authored `ithy-opsx-test-probe` skill whose only behavior is
   to write a nonce-bearing JSON artifact. Claude remains the authoritative
   source; a drift-tested portable derivative lets the existing renderers
   supply native project-local command/prompt files for every supported CLI.
2. Add a live smoke-test command that selects an Agent with the `probe` role
   from `agents.yaml`, initializes an isolated temporary project, launches the
   Agent, and asks it to use the probe skill.
3. Validate the artifact's schema, nonce, Agent identity, and completion state;
   fail clearly when the skill is missing, undiscoverable, or not executed.
4. Keep the test opt-in so normal unit tests do not require CLI authentication,
   network access, model usage, or incur cost.

## Capabilities

### New Capabilities

- `agent-skill-installation-smoke-test`: black-box verification that a
  configured Agent can discover and execute an initialized project skill.

### Modified Capabilities

None.

## Impact

- A test-only Claude probe skill, its initialization template, and a
  Claude-derived universal renderer source under `ithyno/skills`.
- A test harness/CLI script using `AgentRegistry` and the normal Agent runner
  environment.
- An `agents.yaml` probe-role fixture or documented example.
- `package.json` opt-in test script and focused deterministic tests.
- No production dispatcher phase, command namespace, or source-of-truth
  conversion changes.
