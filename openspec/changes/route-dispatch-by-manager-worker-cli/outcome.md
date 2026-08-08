# Outcome

## Summary

Dispatch routing now selects the launch mechanism from canonical Manager and
worker CLI identities. Eligible live-shell workers keep the higher-priority
agmsg path, a verified same-CLI adapter uses the Manager's native Agent/Tool,
and all other workers use the server-managed AgentRunner subprocess path.

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
- Full Vitest suite excluding `server/doctor.test.ts`: passed. The doctor suite
  was excluded because this environment has no contracted Claude session; no
  implementation behavior in this change depends on a live Claude response.
- `npm run build`: passed.
- `npm run openspec -- validate route-dispatch-by-manager-worker-cli --strict`:
  passed.
- `npm run openspec -- validate --all`: passed.

The same-CLI native branch was exercised through the routing matrix and rendered
Claude dispatch contract tests (`Claude + Claude -> native`). A billable live
Claude Task/Agent session was intentionally not used in this environment. The
cross-CLI registry-backed branch was exercised by AgentRunner tests that create
temporary Git repositories/worktrees, resolve subprocess argv, wait for process
completion, and verify completed, crashed, duplicate, cancellation, and timeout
states.

Rendered-content coverage verifies the Claude, Codex, Agy, and fallback-client
outputs preserve routing priority, AgentRunner fallback, synchronous wait,
transport timeout, and the absence of generic direct argv assembly.
