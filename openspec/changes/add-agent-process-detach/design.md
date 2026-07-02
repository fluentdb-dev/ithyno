## Context

`add-agent-pty-runner` gave every agent a real PTY, which was the right
move for TTY-detecting CLIs. But the PTY master lives in the Node
process, which means the child dies when Node dies. Combined with
`agentRunner.shutdown()` sending SIGTERM to every child on exit, any
server restart during a run destroys all in-flight work.

That was acceptable when runs were quick. It stops being acceptable
once we ship `-p` mode Claude, where a change can take 20–60 minutes.
`dev:test` (skip the `--watch`) helps by removing the restart trigger,
but the pain returns the moment a real code fix needs to land.

We need a mode in which the agent process is genuinely independent of
the server lifetime. This change introduces one, opt-in per agent.

## Goals / Non-Goals

**Goals:**
- Restarting the server does not kill agents that opted in.
- Restarting the server does not lose the fact that those agents exist —
  they show up as `running` jobs again after startup.
- No TTY. `-p` mode agents don't need one, and the alternative (tmux /
  supervisor daemon) is a much bigger surface area.
- Worktree tasks progress continues to flow — the fs watcher does not
  care about the process being detached.

**Non-Goals:**
- Preserving PTY interactivity across restarts.
- Adopting worktrees from before the meta-file convention exists.
- Interactive stdin for adopted jobs.
- Server ↔ agent IPC (a whole daemon topology). This is `fork + files`,
  nothing fancier.

## Decisions

### Two modes side-by-side

`agents.yaml` gains `detached?: boolean` per agent. The default (`false` /
absent) is the current PTY path. Opt-in is per agent, per use case:

- **Claude in `-p` mode**: `detached: true` — no TTY needed, silent
  until done, benefits massively from surviving a save.
- **Interactive CLI** where the user answers prompts via the xterm view:
  keep the default PTY mode.

Adding both is important — nothing in this change removes existing
behavior.

### Spawn shape: `child_process.spawn` (not node-pty)

Detached agents spawn via Node's `child_process.spawn` with:

```
{
  detached: true,
  cwd: worktreePath,
  env: { ...process.env, ...resolved.env },
  stdio: ["ignore", logFd, logFd],
}
```

Then `child.unref()`. The child gets its own process group, its
stdin is `/dev/null`, and stdout+stderr both write to a log file the
runner opens beforehand.

Why not `node-pty` with `{ detached: true }`? Because the PTY master
lives in Node; even if the child is in its own pgrp, killing Node
closes the master → SIGHUP → child dies. The whole point of detaching
is to sever that dependency, and losing the PTY is the price.

### Meta file: `.worktrees/<change-id>/.agent-meta.json`

```json
{
  "jobId": "job-…",
  "changeId": "add-vscode-extension",
  "agentName": "claude",
  "pid": 12345,
  "startedAt": 1782000000000,
  "logPath": "/…/.worktrees/add-vscode-extension/.agent.log"
}
```

Written after `spawn` returns, before the runner emits
`agent-job-started`. Path in the worktree (not `~/.config`) so it lives
with the change; `clean:worktrees` picks it up as a side effect.

On adoption we validate: file parses, pid is alive (`process.kill(pid, 0)`),
worktree still exists. Any check fail → the meta file is a stale
breadcrumb and gets deleted, not adopted.

### Adoption at startup

`server/index.ts` calls `agentRunner.adoptDetached()` right after
constructing `agentRunner`, before wiring up the WebSocket server. It
scans `<projectRoot>/.worktrees/*/.agent-meta.json`, adopts each live
one, and starts the log-tail + worktree-tasks watchers.

If the adopted process dies during adoption (race), the runner detects
`ENOENT` on `process.kill(pid, 0)` and cleans up.

### Log-tail as the output pipe for adopted / detached jobs

For fresh detached spawns, we ALSO tail the log file as we write to it
(rather than trying to keep the fd open in memory) — same code path as
adoption, one less special case.

Chokidar watches the log path. Every append emits an
`agent-job-output` event with `stream: "stdout"`. There is no `stderr`
distinction — the file has both — and `stdin` is not applicable for
detached jobs.

### Exit detection for detached jobs

`SIGCHLD` doesn't reach us because the child is in its own pgrp. So the
runner polls `process.kill(pid, 0)` on a slow interval (say every
3 seconds) per detached job. When the kill throws `ESRCH`, the process
is gone; the runner reads the final log tail, transitions status to
`completed` (there is no exit code without SIGCHLD — see next), and
emits the finish event.

We LOSE the exit code by going through this path. A follow-up could
have the child write its own exit code to a `.exit` file next to the
log via a small wrapper script; for v1 we accept `exitCode: null` on
detached completions.

### Cancel

`cancel(id)` for a detached job sends `SIGTERM` to the recorded pid.
The exit detector picks up the death on the next poll and finalizes.

### Shutdown

`shutdown()` iterates active jobs, dispose worktree watchers, then
SIGTERMs pty-mode processes. Detached processes are **skipped**. Their
meta files remain; startup will adopt them again.

### Interactive stdin

`writeInput()` for detached jobs returns
`{ ok: false, status: 409, reason: "This job is detached; interactive input is disabled." }`.
Fresh non-detached agents continue to accept input as before.

## Alternatives considered

- **tmux / dtach / screen wrapper**. Robust; preserves TTY across
  restarts. Rejected for v1 because it adds an external binary
  dependency and multiplies the ways the runner can fail to reattach
  ("session name collision", "tmux not on PATH", "different tmux
  version emits different capture format"). Detach + files is
  self-contained.
- **A separate supervisor daemon** that owns the PTYs, communicates
  with the server via Unix socket, survives independently. Correct in
  the limit; way more code than the pain we have justifies right now.
- **Never SIGTERM on shutdown; rely on OS reparenting to init**.
  Rejected: on macOS/Linux the child's PTY master gets closed when
  Node exits, so the child dies of SIGHUP anyway even without our
  SIGTERM. This alternative "works" only if we've already switched to
  file-based stdio, which is 90% of this proposal already.
- **Ship this as always-on**. Rejected: it removes PTY features
  (interactive stdin, cursor-motion output rendering) that some users
  still want for `add-agent-stdin-relay` and `add-agent-xterm-output`
  workflows. Per-agent opt-in preserves that choice.

## Risks

- **PID reuse**. Between server exit and restart, the OS could reuse
  the child's pid for an unrelated process. Adoption's
  `process.kill(pid, 0)` reports "alive" but the pid is a different
  program. Mitigation: cross-check the process's cmdline (Linux
  `/proc/<pid>/cmdline`, macOS `ps -p <pid> -o command=`) against the
  meta's `agentName` before adopting; on mismatch, discard the meta
  file. Documented; implemented in v1.
- **Log file grows without bound**. Add a size cap (`RING_LIMIT`
  equivalent for the on-disk log) and either rotate or truncate on
  cap. Or leave unbounded and document it — worktrees are ephemeral.
  v1: leave unbounded, document.
- **Meta files leak** when a worktree is deleted out-of-band without
  going through the runner. `clean:worktrees` already handles this
  (it removes the whole worktree tree). Documented.
- **Node's `spawn` on Windows** does not fully honor `detached: true`
  the same way; children inherit console. Detached mode is macOS/Linux
  only for v1. `agents.yaml` load emits a warning if `detached: true`
  is set on Windows.
- **Exit code lost on adoption / detached exit**. Documented; a
  follow-up (`add-agent-exit-code-sidecar`) could ship a `.exit` file
  from a wrapper. v1 accepts `exitCode: null` for these cases; the
  status (`completed` vs `crashed`) is still distinguishable from the
  log's contents at review time.
