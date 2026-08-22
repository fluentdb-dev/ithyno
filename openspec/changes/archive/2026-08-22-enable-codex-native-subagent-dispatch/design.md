## Context

The routing registry and canonical dispatch skill currently recognize native delegation for Claude (`Task`/`Agent`) and Agy (`invoke_subagent`) only. Current Codex CLI releases expose stable multi-agent collaboration tools, including `spawn_agent` and `wait_agent`, but the Codex renderer still states that no native sub-agent surface exists.

Codex's current spawn contract accepts a task name, prompt, context-fork policy, and model override. CLI-shaped worker configuration therefore needs translation into the native contract rather than being forwarded as subprocess argv.

## Goals / Non-Goals

**Goals:**

- Route an eligible Codex Manager → Codex Worker stage through Codex collaboration tools.
- Preserve execution-root, artifact, rework, ordering, and semantic-verdict contracts.
- Preserve explicit worker configuration instead of silently dropping unsupported options.
- Keep the Claude-authored dispatch definition and generated CLI surfaces synchronized.

**Non-Goals:**

- Add native delegation between different CLI families.
- Change agmsg priority or the existing Claude and Agy native adapters.
- Reproduce arbitrary process-local environment configuration inside a native child.
- Remove AgentRunner subprocess support.

## Decisions

### 1. Register Codex as a conditional native adapter

The registry will recognize canonical CLI `codex` as having a native adapter. A same-CLI Codex worker uses native delegation when collaboration tools are available and no process-only environment is required; cross-CLI workers and unavailable or process-incompatible native execution use AgentRunner.

This retains an explicit fallback without treating CLI syntax itself as proof that native delegation is impossible.

### 2. Treat explicit configuration as authoritative

Before spawning a native Codex child, the dispatcher will extract `-m <id>`, `--model <id>`, or `--model=<id>` and pass the value to `spawn_agent.model`. Approval and sandbox CLI flags describe subprocess transport; native children instead operate within the Manager session's permission boundary. A worker-specific environment or other requirement for a distinct process continues to select AgentRunner.

The compatibility check will be explicit and covered by routing tests rather than inferred from prose alone.

### 3. Carry contracts in the native child prompt

Codex native delegation will call `spawn_agent` with a bounded stage task containing:

- the resolved role prompt;
- the exact absolute execution root and a prohibition on editing outside it;
- the exact review/verify artifact path when applicable;
- prior review findings during rework; and
- the existing role ownership rules.

The Manager will wait with `wait_agent` before judging stage completion. It will continue to judge review and verify semantically from the artifact file, not from the child response alone.

### 4. Keep source-of-truth and generated surfaces aligned

The Claude-authored dispatch skill remains the behavioral source. The Codex renderer will translate the native-delegation capability to Codex collaboration terminology and will stop emitting the stale subprocess-only claim. Generated prompt and skill entrypoints will be checked by renderer and drift tests.

## Risks / Trade-offs

- **Codex collaboration tool names or arguments change** → Keep native wording localized in the Codex renderer and retain AgentRunner fallback.
- **A configured child model is ignored** → Parse all supported Codex model flag forms, pass the model explicitly to `spawn_agent`, and cover the mapping with tests.
- **A spawned agent edits the Manager tree instead of the worktree** → Include an absolute execution-root contract in every native prompt and cover it in rendered-output tests.
- **A child completes without the expected artifact** → Preserve the existing artifact parser and escalation behavior; native completion alone is not success.
- **Generated copies drift** → Regenerate through the renderer pipeline and run existing drift guards.
