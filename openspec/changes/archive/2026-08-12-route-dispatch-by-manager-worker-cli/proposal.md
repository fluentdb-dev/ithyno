---
tags: [feature/agent-runner, feature/cross-cli, role/manager]
execution: worktree
---

## Why

The dispatch skill currently chooses its native delegation path with
`entry.command == "claude"` and otherwise constructs a subprocess command
itself. That describes an implementation detail rather than the real contract:
a Manager should use its own native Agent/Tool when the selected worker uses
the same Agent CLI, while a worker on another CLI must run through that CLI's
non-interactive subprocess form.

The duplicated subprocess construction also bypasses `AgentRegistry.resolve()`.
Consequently, fixes such as Agy's required `-p` print flag and Codex's distinct
`exec <prompt>` grammar can work through `POST /api/agents/run` but remain
absent or incorrect in `/ithy-opsx:dispatch`.

## What Changes

- Route a worker by comparing the canonical Manager CLI and worker CLI, rather
  than treating Claude as the definition of native delegation.
- Preserve the existing agmsg branch for eligible `live-shell` workers, then
  use a client-native Agent/Tool for same-CLI delegation when an adapter is
  available, and use the server Agent runner for cross-CLI or unsupported
  native delegation.
- Use Agy/Antigravity's `invoke_subagent` tool for same-CLI native delegation
  on the verified Agy 1.1.11 runtime, while retaining AgentRunner for Agy
  cross-CLI execution.
- Install an Agy project rule with the dispatch workflow so the Manager cannot
  silently perform a selected worker role itself instead of calling
  `invoke_subagent`.
- Use Agy's singular `.agent/` project root for workflows, rules, smoke probes,
  and installation checks; migrate output from older ithyno builds that used
  `.agents/workflows/` in the opposite direction.
- Emit Agy workflows as flat `.agent/workflows/ithy-opsx-<command>.md` files
  and translate Claude-style frontmatter and colon command references to Agy's
  filename-derived hyphen form.
- Make the server registry the single owner of subprocess argv construction:
  Codex receives `codex ... exec <prompt>` and all other supported CLIs receive
  `<cli> ... -p <prompt>` without requiring users to add the prompt flag in
  `agents.yaml`.
- Allow the server runner to reuse only the dispatcher-derived execution root
  (the known worktree or the project root), without accepting an arbitrary
  filesystem path from the Manager.
- Keep Claude-authored ithyno dispatch definitions as the source of truth and
  generate client-specific native-delegation instructions through the existing
  renderer pipeline.
- Generate a thin Codex Skill-catalog entrypoint for single-change dispatch in
  addition to its Prompt, so `ithy-opsx-dispatch <change-id>` resolves exactly
  instead of falling through to `ithy-opsx-dispatch-multi`.
- Preserve dispatch-multi's per-change pipeline ordering while allowing workers
  for different changes to run concurrently at different stages; AgentRunner
  launches must fan out before any one change blocks completion processing.
- Add routing-matrix, argv, worktree-reuse, generated-skill drift, and dispatch
  integration coverage.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runner`: define runtime-aware native delegation and registry-backed
  cross-CLI worker execution for the ithyno dispatcher.

## Impact

- `server/agents/registry.ts`, `server/agents/runner.ts`, and the local Agent
  run API.
- Claude-canonical dispatch command/skill sources, universal ithyno skill
  sources, and per-CLI renderer output.
- The dispatch-multi completion loop and AgentRunner job ownership contract.
- Existing project-local ithyno dispatch skills require regeneration after the
  implementation is released; OpenSpec skills are unchanged.
- No new `agents.yaml` fields and no requirement for users to add `-p`, `exec`,
  or project paths manually.
