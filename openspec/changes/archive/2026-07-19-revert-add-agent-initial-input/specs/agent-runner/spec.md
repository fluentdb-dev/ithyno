# Delta: agent-runner — retire add-agent-initial-input, clarify per-mode delivery

## ADDED Requirements

### Requirement: initialInput Field Applies Per Agent Mode

The registry SHALL deliver the `initialInput` field from
`agents.yaml` (or the equivalent per-role `prompts` map entry
post-reshape) to the agent's process by a mechanism chosen based
on the agent's `mode` field. The registry SHALL emit an
`initialInputMode` alongside the resolved `initialInput` so
downstream code paths (PTY, runner) can select the delivery
mechanism without re-inspecting the raw config.

- **`mode: live-shell`**: `AgentRegistry.resolve()` populates
  `initialInput` with the resolved prompt string and sets
  `initialInputMode: "stdin"`. Downstream, the PTY controller
  (`attachPtyToSocket` for the embedded terminal, or the VS Code
  extension bridge) types the string into the running shell
  after the startup command settles. This preserves the
  originally-intended "prompt hits stdin" semantic.
- **`mode: single-prompt`** command-only: `AgentRegistry.resolve()`
  leaves `initialInput` undefined and sets
  `initialInputMode: "cli-arg"`. The agent's prompt is expected
  to live inside its own `args[]` array (user-authored). The
  agent runner does NOT translate `initialInput` for these agents
  because the field is absent.

The delivery mechanism SHALL NOT be reconfigured at runtime — it is
determined at load / resolve time and stays consistent for the
job's lifetime.

#### Scenario: live-shell agent resolves to stdin delivery

- **GIVEN** an `agents.yaml` entry `{ name: "claude-mgr", mode: "live-shell", command: "claude", prompts.manager: "/opsx:manage" }`
- **WHEN** the registry resolves the agent for change `add-foo`
- **THEN** `resolved.initialInput` is `"/opsx:manage"` (or the substituted variant if templates were used)
- **AND** `resolved.initialInputMode` is `"stdin"`

#### Scenario: single-prompt command-only agent has no initialInput

- **GIVEN** an `agents.yaml` entry `{ name: "codex", mode: "single-prompt", command: "codex", args: ["/opsx:apply ${change_id}"] }`
- **WHEN** the registry resolves the agent for change `add-foo`
- **THEN** `resolved.initialInput` is `undefined`
- **AND** `resolved.initialInputMode` is `"cli-arg"`
- **AND** the prompt lives in `resolved.args[0]` after template substitution

#### Scenario: Template variables substitute inside initialInput

- **GIVEN** an `agents.yaml` entry with `prompts.manager: "/opsx:manage ${change_id}"`
- **WHEN** the registry resolves the agent for change `add-foo`
- **THEN** `resolved.initialInput` is `"/opsx:manage add-foo"`
- **AND** the substitution uses the same engine that `args` and `env` share
