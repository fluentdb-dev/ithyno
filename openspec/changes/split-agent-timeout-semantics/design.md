## Context

ithyno currently has three competing timeout owners. The agmsg branch uses
fixed dispatcher ceilings (15 minutes for code and 5 minutes for review and
verify), subprocess CLIs may enforce their own defaults, and the Agent runner
does not expose a common activity-aware timeout policy. A silent model request,
a hung process after partial work, and a healthy long-running implementation
therefore collapse into the same generic failure.

The Agy code-worker incident that prompted this change illustrates the gap: the
process started, produced no output or worktree changes, and exited on Agy's
five-minute print timeout. ithyno could report only a generic timeout even
though no implementation activity ever began.

## Goals / Non-Goals

**Goals:**

- Distinguish process startup, first worker activity, idle stalls, absolute
  runtime exhaustion, and post-completion artifact races.
- Keep healthy active work alive until a separately configured hard deadline.
- Apply the same timeout model to subprocess, Task-tool, and agmsg workers.
- Make timeout ownership and recovery deterministic and testable.
- Preserve safe partial work and report actionable timeout classifications.

**Non-Goals:**

- Guaranteeing that every vendor CLI exposes token-level model progress.
- Estimating completion time or terminating work based on task complexity.
- Replacing the existing rework-round convergence limit.
- Automatically discarding partial work after a timeout.
- Adding a Settings editor for timeout values in this change.

## Decisions

### D1 — Five distinct timers

The supervisor tracks these deadlines independently:

1. `startupSeconds`: time allowed for the child process or remote worker to
   acknowledge that it started.
2. `firstActivitySeconds`: time from startup acknowledgement to the first
   qualifying worker activity.
3. `idleSeconds`: maximum gap between subsequent qualifying activities.
4. `hardSeconds`: absolute runtime from startup acknowledgement; activity never
   resets it.
5. `artifactGraceSeconds`: time after a completion signal or successful exit for
   a required artifact to become readable.

This separates "nothing answered" from "work is still progressing" without
allowing a noisy or looping worker to run forever.

### D2 — Top-level defaults with per-Agent overrides

`agents.yaml` accepts:

```yaml
timeouts:
  startupSeconds: 30
  firstActivitySeconds: 180
  idleSeconds: 300
  hardSeconds:
    code: 3600
    review: 1800
    verify: 1800
  artifactGraceSeconds: 5
```

An Agent entry may provide a `timeouts` block with scalar overrides for
`startupSeconds`, `firstActivitySeconds`, `idleSeconds`,
`artifactGraceSeconds`, and `hardSeconds`. An Agent's scalar `hardSeconds`
overrides the top-level value selected for its dispatched role.

Validation rejects non-finite, non-positive, or out-of-range values and rejects
a resolved configuration where `hardSeconds` is not greater than both
`startupSeconds` and `firstActivitySeconds`. Missing configuration uses the
defaults above, so existing projects migrate without edits.

### D3 — Activity is evidence, not mere process liveness

Qualifying activity is any of:

- a non-empty streamed stdout or stderr event from the worker adapter;
- a job-output/progress event emitted by the Agent runner;
- an explicit agmsg heartbeat matching
  `stage:<S> status:working change:<change-id>`;
- a scoped worktree mutation outside ignored generated/cache directories.

Process existence, timer polling, and repeated identical Manager activity posts
do not count. The first qualifying event clears the first-activity timer and
starts idle monitoring; each later event resets only the idle timer.

Adapters SHOULD request streaming output where supported. A buffered CLI can
still demonstrate activity through worktree changes or heartbeats, and projects
can raise its per-Agent first-activity limit when necessary.

### D4 — ithyno owns the effective timeout

Known CLI adapters align or disable vendor-native prompt timeouts so they cannot
expire before ithyno's resolved hard deadline. If a CLI still exits with its
own timeout, the adapter reports `native-timeout` separately rather than
misclassifying it as ithyno's idle or hard timeout.

This avoids silently rewriting arbitrary user arguments while still ensuring
that known flags such as Agy's print timeout do not preempt the supervisor.

### D5 — Timeout classes drive recovery

- `startup-timeout` and `first-activity-timeout`: terminate and retry the same
  configured worker once, because no useful work has been observed.
- `idle-timeout`: terminate; if the worktree is dirty, preserve it and pass a
  resume warning to Manager fallback or the next code attempt. Never discard or
  overwrite partial work automatically.
- `hard-timeout`: terminate and enter Manager fallback or escalation without an
  identical automatic retry.
- `native-timeout`: follow the same recovery as first-activity or idle timeout
  according to whether qualifying activity had previously occurred.
- `artifact-timeout`: completion was reported but the required artifact did not
  appear within the grace period; treat it as an artifact contract failure, not
  as an implementation timeout.

Every result carries `timeoutKind`, elapsed time, last-activity time, Agent,
role, and whether partial work exists.

### D6 — One supervisor shared by all dispatch branches

A reusable timeout supervisor owns clocks and emits state transitions. The
subprocess runner feeds output and filesystem activity directly. The agmsg path
feeds spawn acknowledgement, heartbeat, and completion messages. The Task-tool
path feeds tool lifecycle/progress events when available and worktree activity
otherwise. The dispatcher documentation consumes the supervisor result instead
of implementing a separate fixed polling ceiling.

All tests use an injected monotonic clock and fake timers; no timeout test waits
for real minutes.

## Risks / Trade-offs

- **Buffered CLIs can look inactive while reasoning** → Count worktree and
  heartbeat evidence, request streaming when supported, and allow per-Agent
  first-activity overrides.
- **Filesystem watchers can produce noisy activity** → Ignore `.git`,
  `node_modules`, build caches, and supervisor-owned metadata; debounce repeated
  events.
- **A continuously noisy hung worker can avoid idle timeout** → The hard deadline
  never resets.
- **Long defaults delay genuine failure** → Startup and first-activity timers
  fail quickly before the role-specific hard deadline matters.
- **Partial work complicates retries** → Preserve it, report it explicitly, and
  resume through the existing Manager fallback rather than deleting it.
- **Vendor timeout flags vary** → Keep normalization in per-CLI adapters and
  cover each supported adapter with contract tests.

## Migration Plan

Projects without `timeouts` receive the new defaults automatically. Existing
fixed dispatcher ceiling code is replaced only after the shared supervisor and
adapter coverage land. Rollback restores the former fixed ceilings; the optional
`timeouts` blocks remain harmless unknown configuration to older versions only
if their registry parser preserves unknown top-level and Agent keys.

## Open Questions

None.
