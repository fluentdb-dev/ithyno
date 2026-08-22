## 1. Native routing

- [x] 1.1 Register Codex as a native child-agent adapter in the canonical CLI routing registry.
- [x] 1.2 Add native compatibility and model-intent translation so Codex `-m` / `--model` settings reach `spawn_agent`, while process-only configuration still selects AgentRunner.
- [x] 1.3 Extend the routing matrix tests for model-specific Codex native delegation, process-environment fallback, unavailable-tool fallback, cross-CLI routing, and agmsg priority.

## 2. Dispatch skill and rendering

- [x] 2.1 Update the Claude-authoritative dispatch skill with the Codex `spawn_agent` and `wait_agent` flow, absolute execution-root contract, artifact contract, and fallback rules.
- [x] 2.2 Update the Codex renderer so native delegation is expressed with Codex collaboration tools and stale subprocess-only capability claims are removed.
- [x] 2.3 Regenerate or synchronize the project, template, and VS Code dispatch outputs without changing the Claude and Agy delegation contracts.

## 3. Validation

- [x] 3.1 Add renderer and drift-guard tests that assert Codex native instructions and native-incompatible AgentRunner fallback are both present.
- [x] 3.2 Run the focused registry, renderer, and initialization tests plus TypeScript type checking.
- [x] 3.3 Run strict OpenSpec validation for `enable-codex-native-subagent-dispatch`.
