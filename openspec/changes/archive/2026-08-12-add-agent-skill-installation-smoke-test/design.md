## Context

There are two distinct assertions:

1. **Installation assertion** — expected files exist at CLI-specific paths.
2. **Agent usability assertion** — a real Agent session discovers and follows
   the installed skill.

The first is deterministic and already belongs in normal tests. The second is
an external, model-backed integration test. Agent self-report alone is weak,
so the live test requires a nonce-bearing artifact whose required shape is
defined only by the probe skill.

This change does not decide whether an existing command or prompt should also
be a skill. The probe is authored as a skill from the start, with Claude as
the canonical source.

## Goals

- Exercise the same Agent configuration and project-local environment used by
  real workers.
- Prove a skill is usable, rather than only present on disk.
- Produce actionable diagnostics for missing installation, CLI startup,
  timeout, and malformed/missing artifact failures.
- Avoid affecting standard test runs and production dispatch state.

## Non-Goals

- Adding `probe` to the `code → review → verify` dispatcher pipeline.
- Promoting commands or prompts into skills.
- Replacing deterministic renderer and initialization tests.
- Claiming that a model-backed smoke test is fully deterministic.
- Testing the business behavior of Review, Verify, Archive, or other skills.

## Decisions

### D1 — Claude is the authoritative probe source

The canonical probe lives at
`.claude/skills/ithy-opsx-test-probe/SKILL.md` and the corresponding template
location. A portable derivative at
`ithyno/skills/ithy-opsx-test-probe/SKILL.md` is mechanically drift-tested
against that Claude body and declares all seven supported renderers. The test
invokes normal initialization for the selected Agent CLI; it does not
hand-create a target CLI copy. This means the smoke test also covers the real
installation path without changing which source is authoritative.

### D2 — Agent selection uses `agents.yaml`

The harness selects an Agent whose `roles` includes `probe`, optionally
narrowed by `--agent <name>`. An example is:

```yaml
agents:
  - name: codex-probe
    command: codex
    mode: single-prompt
    roles: [probe]
    prompts:
      probe: >-
        Use the ithy-opsx-test-probe skill with token ${change_id} and write
        the required artifact. Do not perform any other project work.
```

`probe` remains an explicit custom role understood by the smoke harness, not
a production dispatch stage.

### D3 — Artifact contract instead of stdout verdict

The harness generates an unpredictable nonce and passes it through the normal
prompt substitution field. The probe writes a JSON artifact beneath a
test-owned temporary directory:

```json
{
  "schemaVersion": 1,
  "probe": "ithy-opsx-test-probe",
  "agent": "codex-probe",
  "nonce": "<generated nonce>",
  "status": "recognized"
}
```

The harness accepts success only when the artifact exists, parses, and matches
the expected nonce and Agent. Stdout may be retained for diagnostics but is not
the success signal.

### D4 — Isolated, opt-in live execution

The live command uses a temporary initialized project and a bounded timeout.
It runs only when explicitly requested, for example:

```bash
RUN_AGENT_SKILL_E2E=1 npm run test:agent-skills -- --agent codex-probe
```

Normal `npm test` executes deterministic harness tests with a fake runner but
does not start Claude, Codex, or another model-backed CLI.

### D5 — Layered diagnostics

Before spawning, the harness reports separately whether:

- the configured Agent exists and has role `probe`;
- initialization completed;
- the expected CLI-specific skill path exists;
- the Agent subprocess started and exited within the timeout;
- the artifact was present and valid.

This makes an installation failure distinguishable from authentication,
runner, prompt, or model-behavior failures.

## Risks

- **Model nondeterminism:** keep the skill tiny, require an exact artifact, and
  allow explicit retries only at the outer test-command level.
- **False confidence from file reads:** the artifact proves the Agent followed
  the probe contract, but cannot perfectly prove which internal discovery path
  it used. CLI trace evidence may be recorded when available, without making
  vendor-specific logs the portable contract.
- **Cost or accidental CI execution:** require an explicit environment gate
  and exclude the live path from `npm test`.
- **Stale persistent sessions:** use a new subprocess per live probe so skill
  discovery occurs after initialization.
- **Source-of-truth drift:** deterministic coverage compares the portable
  renderer body with the Claude-authored probe; no independent target-CLI
  probe body is maintained.
