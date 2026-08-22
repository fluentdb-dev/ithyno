## 1. Timeout Configuration

- [ ] 1.1 Add shared timeout types and documented defaults for startup,
  first activity, idle, role-specific hard runtime, and artifact grace.
- [ ] 1.2 Parse and validate the top-level `agents.yaml.timeouts` block and
  expose the resolved values through the public Agent configuration.
- [ ] 1.3 Parse optional per-Agent timeout overrides and resolve them against
  the dispatched role and project defaults.
- [ ] 1.4 Add registry tests for defaults, overrides, ranges, non-finite values,
  and invalid relationships between startup, first activity, and hard runtime.

## 2. Shared Timeout Supervisor

- [ ] 2.1 Implement an injectable monotonic-clock supervisor with independent
  startup, first-activity, idle, hard-runtime, and artifact-grace timers.
- [ ] 2.2 Feed streamed output, runner progress, scoped worktree changes, agmsg
  heartbeats, and completion signals into the supervisor's activity model.
- [ ] 2.3 Ignore process liveness, polling, duplicate telemetry, `.git`,
  dependency caches, and supervisor-owned metadata as activity.
- [ ] 2.4 Return structured timeout results containing timeout kind, elapsed
  runtime, last activity, Agent, role, and partial-work state.
- [ ] 2.5 Add fake-clock tests covering every timer transition, activity reset,
  hard-deadline immutability, cancellation races, and artifact grace.

## 3. CLI and Dispatch Integration

- [ ] 3.1 Integrate the supervisor with Agent subprocess jobs and Task-tool
  lifecycle events without changing successful exit/artifact behavior.
- [ ] 3.2 Extend the agmsg boot contract with bounded working heartbeats and
  consume heartbeat and completion messages through the shared supervisor.
- [ ] 3.3 Add per-CLI native-timeout normalization, including Agy print timeout,
  and classify unavoidable vendor exits as `native-timeout`.
- [ ] 3.4 Apply timeout-specific recovery: retry startup/first-activity once,
  preserve partial work on idle, and avoid identical retry after hard timeout.
- [ ] 3.5 Replace fixed ceilings in the Claude command, template command, and
  universal `ithy-opsx-dispatch` source, then verify Codex rendering preserves
  native command names.

## 4. Diagnostics and Regression Coverage

- [ ] 4.1 Surface structured timeout kinds and partial-work state in job APIs,
  dispatch results, logs, and existing worker-status UI diagnostics.
- [ ] 4.2 Add subprocess, Task-tool, and agmsg contract tests for no first
  response, healthy long implementation, post-progress idle, hard timeout,
  native timeout, and delayed artifact cases.
- [ ] 4.3 Verify timed-out dirty worktrees remain intact and clean
  first-activity timeouts do not create commits or phase transitions.
- [ ] 4.4 Verify timeout cleanup clears Manager activity, releases owned
  semaphores, and performs only targeted worker cleanup.

## 5. Verification and Documentation

- [ ] 5.1 Document the timeout configuration fields, defaults, timeout kinds,
  activity sources, and per-Agent override examples.
- [ ] 5.2 Run `npm run typecheck && npm test && npm run build`.
- [ ] 5.3 Run `npm run openspec -- validate split-agent-timeout-semantics --strict`
  and validate all affected specifications.
- [ ] 5.4 Exercise one silent worker and one active long-running fake worker,
  then write `outcome.md` before archive.
