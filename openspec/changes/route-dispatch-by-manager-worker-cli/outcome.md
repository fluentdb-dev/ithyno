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
- Full Vitest suite: passed (843 tests passed, 1 skipped). Existing fixtures
  emitted non-fatal watcher and sandboxed agmsg configuration warnings.
- `npm run build`: passed.
- `npm run openspec -- validate route-dispatch-by-manager-worker-cli --strict`:
  passed.
- `npm run openspec -- validate --all`: passed.

The same-CLI native branches are covered by routing and rendered-contract tests
for Claude Task/Agent and Agy `invoke_subagent`. A live Agy child dispatch and a
live cross-CLI dispatch remain pending under task 5.4; unit/integration coverage
does not claim to substitute for that manual exercise. The cross-CLI
registry-backed branch is otherwise covered by AgentRunner tests that create
temporary Git repositories/worktrees, resolve subprocess argv, wait for process
completion, and verify completed, crashed, duplicate, cancellation, and timeout
states.

Rendered-content coverage verifies the Claude, Codex, Agy, and fallback-client
outputs preserve agmsg priority, Agy `invoke_subagent`, cross-CLI AgentRunner
fallback, synchronous wait, transport timeout, and the absence of generic
direct argv assembly.
