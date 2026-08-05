## 1. Define the Claude-authoritative probe

- [ ] 1.1 Add `ithy-opsx-test-probe` under the Claude skill source and template
  surfaces with a nonce-bearing JSON artifact contract.
- [ ] 1.2 Add drift coverage proving the in-repo and template probe definitions
  remain identical.
- [ ] 1.3 Verify existing selected-CLI initialization materializes the probe
  without adding a separately authored target-CLI body.

## 2. Build the deterministic harness core

- [ ] 2.1 Add probe-Agent selection from `agents.yaml`, supporting role
  `probe` and optional `--agent <name>` narrowing.
- [ ] 2.2 Add nonce generation, expected CLI-specific skill-path resolution,
  bounded timeout configuration, and artifact schema validation.
- [ ] 2.3 Add layered error results for configuration, initialization, skill
  path, subprocess, timeout, and artifact failures.
- [ ] 2.4 Unit-test the harness with fake initialization and runner adapters,
  including exit-zero-without-artifact failure.

## 3. Add opt-in live Agent execution

- [ ] 3.1 Launch the selected Agent through the existing registry/runner
  environment in an isolated temporary initialized project.
- [ ] 3.2 Add the explicit `RUN_AGENT_SKILL_E2E=1` gate and a
  `test:agent-skills` package script; keep it out of default `npm test`.
- [ ] 3.3 Capture bounded subprocess diagnostics while treating only the JSON
  artifact as the success signal.
- [ ] 3.4 Add a documented Claude and Codex `agents.yaml` probe example.

## 4. Verify the proposal and implementation

- [ ] 4.1 Run deterministic probe harness and initialization tests.
- [ ] 4.2 Run `npm run typecheck && npm test && npm run build`.
- [ ] 4.3 Manually run the opt-in smoke test for configured Claude and Codex
  probe Agents when credentials and network access are available.
- [ ] 4.4 Run `npm run openspec -- validate add-agent-skill-installation-smoke-test --strict`.
- [ ] 4.5 Write `outcome.md` before archive.
