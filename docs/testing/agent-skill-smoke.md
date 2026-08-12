# Agent skill installation smoke test

This opt-in live test verifies that an Agent selected from `agents.yaml` can
use the Claude-authored `ithy-opsx-test-probe` after normal CLI-specific
initialization. It is not part of `npm test` and may require authentication,
network access, time, and model usage.

Add a dedicated Agent entry:

```yaml
agents:
  - name: codex-probe
    command: codex
    mode: single-prompt
    roles: [probe]
    args: []
    prompts:
      probe: Use the ithy-opsx-test-probe skill with nonce ${change_id}.
```

For Claude, change `name` and `command` and keep the same natural-language
probe prompt:

```yaml
agents:
  - name: claude-probe
    command: claude
    mode: single-prompt
    roles: [probe]
    args: []
    prompts:
      probe: Use the ithy-opsx-test-probe skill with nonce ${change_id}.
```

Run one Agent explicitly:

```bash
RUN_AGENT_SKILL_E2E=1 npm run test:agent-skills -- --agent codex-probe
```

Or use the isolated Codex fixture without changing the project's operational
`agents.yaml`:

```bash
RUN_AGENT_SKILL_E2E=1 npm run test:agent-skills -- \
  --config fixtures/agent-skill-smoke/agents.yaml \
  --agent codex-probe
```

The harness creates and removes an isolated temporary project, runs normal
ithyno initialization, and runs the repository's installed OpenSpec CLI as a
prerequisite setup step.
OpenSpec itself is not the test subject and its command discovery is not a
success signal.

The Claude-authored ithyno probe remains project-local. For Codex it is
rendered to the temporary project's
`.codex/skills/ithy-opsx-test-probe/SKILL.md`; it is never installed into the
user's global Codex home. Success is determined only from the nonce-bearing
JSON artifact written by the probe; stdout and exit code alone are
insufficient.

The portable derivative under `ithyno/skills/ithy-opsx-test-probe` lets the
same selected-CLI initialization cover Antigravity, Cursor, Gemini, Copilot,
and OpenCode through their normal project-local renderer paths. Its body is
drift-tested against the Claude-authoritative skill.
