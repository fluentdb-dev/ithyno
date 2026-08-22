## ADDED Requirements

### Requirement: Codex Dispatch Renderer Uses Native Collaboration

The Codex renderer SHALL translate native worker delegation in the canonical
dispatch source to Codex's available collaboration tools. The rendered workflow
MUST name `spawn_agent` as the worker launch operation and `wait_agent` as the
completion operation, MUST translate configured model intent to the native
model field, and MUST retain AgentRunner as the fallback when native tools are
unavailable or cannot preserve process-only worker configuration.

#### Scenario: Compatible Codex worker is rendered natively
- **WHEN** the Codex renderer emits the dispatch workflow
- **THEN** the output instructs a Codex Manager to call `spawn_agent` for a compatible same-CLI Codex worker
- **AND** it instructs the Manager to call `wait_agent` before stage judgment
- **AND** it includes the exact execution-root and artifact contracts in the delegated task

#### Scenario: Model-specific Codex worker keeps its model
- **GIVEN** a Codex worker has an explicit model override
- **WHEN** the rendered workflow selects a launch strategy
- **THEN** it extracts the model from `-m` or `--model`
- **AND** it passes the model to `spawn_agent`
- **AND** it keeps the worker on the native delegation path

#### Scenario: Generated Codex text contains no stale capability claim
- **WHEN** the Codex dispatch prompt and catalog skill are generated
- **THEN** they do not state that Codex lacks a native subagent tool
- **AND** they preserve cross-CLI and process-only subprocess fallback instructions
