# Outcome

## Summary

Dispatch routing now selects the launch mechanism from canonical Manager and
worker CLI identities. Eligible live-shell workers keep the higher-priority
agmsg path, Claude same-CLI workers use Task/Agent, Agy 1.1.11 same-CLI workers
use `invoke_subagent`, and cross-CLI or native-unavailable workers use the
server-managed AgentRunner subprocess path.

Agy dispatch installation now also writes an always-loaded project rule at
`.agent/rules/ithy-opsx-dispatch.md`. It requires the Manager to call
`invoke_subagent` for a selected same-CLI Agy worker instead of implementing
the stage itself, while preserving agmsg priority and the AgentRunner fallback.
All Agy project-local workflows, rules, smoke probes, and installation checks
now use singular `.agent/`; only the compatibility migration reads the older
plural `.agents/workflows/` location. Global agmsg paths remain unchanged.
Agy workflows are emitted as flat `ithy-opsx-<command>.md` files, with command
references translated to Agy's hyphen syntax. Existing nested workflow output
under either singular or plural roots is flattened during installation.
Claude-only workflow names and metadata are removed during conversion, so
copied commands are also exposed uniformly as `/ithy-opsx-<command>`.

Codex now receives a thin `.codex/skills/ithy-opsx-dispatch/SKILL.md`
entrypoint alongside the existing Prompt. It matches the plain
`ithy-opsx-dispatch <change-id>` form, reads the Prompt as the single source of
workflow behavior, and prevents accidental substitution by dispatch-multi.

Codex code workers receive the installed OpenSpec Skill name
`openspec-apply-change` together with an implementation-only scope contract.
The former `openspec-apply` shorthand had no matching Skill and could be
interpreted as free-form work beyond the code stage.

AgentRegistry owns subprocess prompt construction: Codex receives
`exec <prompt>`, while non-Codex CLIs receive `-p <prompt>`. Explicit prompt
overrides replace recognized legacy command prompts without dropping unrelated
CLI options or their values.

AgentRunner derives and validates execution roots, supports synchronous
event-driven completion waiting, distinguishes completion, crash, cancellation,
and timeout states, and exposes the behavior through `POST /api/agents/run`
with validated `wait` and `timeoutMs` fields. The dispatcher uses stage-specific
execution ceilings plus independent connection and HTTP transport limits before
judging the established artifact files.

## Verification

- `npm run typecheck`: passed.
- Focused registry, runner, renderer, init, and validation tests: passed.
- Full Vitest suite: passed (847 tests passed, 1 skipped). Existing fixtures
  emitted non-fatal watcher and sandboxed agmsg configuration warnings.
- `npm run build`: passed.
- `npm run openspec -- validate route-dispatch-by-manager-worker-cli --strict`:
  passed.
- `npm run openspec -- validate --all`: passed.

The same-CLI native branches are covered by routing and rendered-contract tests
for Claude Task/Agent and Agy `invoke_subagent`. Manual dispatch verification
also confirmed an Agy same-CLI worker through `invoke_subagent` and cross-CLI
workers through the registry-backed AgentRunner path. The cross-CLI branch is
additionally covered by AgentRunner tests that create temporary Git
repositories/worktrees, resolve subprocess argv, wait for process completion,
and verify completed, crashed, duplicate, cancellation, and timeout states.

Rendered-content coverage verifies the Claude, Codex, Agy, and fallback-client
outputs preserve agmsg priority, Agy `invoke_subagent`, cross-CLI AgentRunner
fallback, synchronous wait, transport timeout, and the absence of generic
direct argv assembly.
