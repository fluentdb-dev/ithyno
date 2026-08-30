---
tags: [feature/agent-runner, area/server]
---

## Why

Agents spawn as children of the Fastify server. When the server restarts
— every time we edit `server/*.ts` on `dev`, and any time we ship a
runner fix — the SIGTERM cascade in `agentRunner.shutdown()` kills all
running agents. Even without the shutdown call, node-pty's PTY master
lives inside the Node process, so when Node exits the child gets
SIGHUP and dies anyway.

This is a real problem now that we have `-p` mode Claude runs that
take 20–60 minutes for a change like `add-vscode-extension`. Any
server-side iteration mid-run means losing the work.

The workaround so far has been `dev:test` (no `--watch`), but that
just delays the pain — the moment we DO need to restart the server,
every running agent still dies.

## What Changes

`agents.yaml` gets a new optional `detached: true` flag per agent.
When set:

- The runner spawns the agent via **`child_process.spawn(..., { detached: true, stdio: ['ignore', logFd, logFd] })`** — not through `node-pty`. Stdout and stderr are written directly to a log file in the worktree.
- The runner calls **`child.unref()`** so the Node event loop does not wait for the child.
- A **meta file** `.worktrees/<change-id>/.agent-meta.json` records `{ pid, agentName, startedAt, logPath, jobId, changeId }`. This is the recovery breadcrumb.
- The runner's **`shutdown()` skips detached processes** — no SIGTERM on server exit.
- On **server startup**, the runner scans `.worktrees/*/.agent-meta.json`, checks each PID is alive, and **adopts** matching processes as `status: "running"` jobs in memory. The log file is tail-watched so subsequent output continues to stream to the WebSocket. `-p` mode agents write nothing until they finish, so this "adoption" mostly just keeps the job visible in the UI until it exits and the runner reaps the meta file.
- **`worktreeTasksWatcher`** attaches to adopted jobs the same way it does to fresh spawns — worktree progress still flows.

Trade-offs accepted for detached mode:
- **No PTY**: TTY-detecting CLIs run in their non-interactive branches. This is fine — `-p` mode is the intended use case and never wanted a TTY.
- **No live stdin from the UI**: `POST /api/agents/jobs/:id/input` returns 409 for detached jobs. Users who need interactive input use a non-detached agent.
- **Output is raw bytes as the child wrote them**: no cursor emulation, no color-code splitting. `-p` prints its final response as plain text; that renders fine in xterm anyway.

PTY-mode agents (the current default, `detached: false` or unspecified) behave exactly as today — the SIGTERM cascade still applies, restart still kills them. This change adds a mode, it does not change the default.

## Capabilities

### New Capabilities
<!-- none — modifies the existing agent-runner capability -->

### Modified Capabilities
- `agent-runner`: agents may declare `detached: true`; such agents run out-of-band (`child_process.spawn` with `detached: true`), are exempt from the shutdown SIGTERM, and are adopted from meta files on server startup

## Impact

- **`server/agents/registry.ts`**: `AgentDef` gains `detached?: boolean`; parsed and mirrored through `resolve()` alongside `initialInput`.
- **`server/agents/runner.ts`**:
  - New branch in `run()` for detached spawn. Instead of the pty path, use `child_process.spawn` with `detached: true` and file-based stdio, then `child.unref()`.
  - Write the meta file after spawn.
  - Track detached jobs separately so `shutdown()` can skip them; the meta file remains as the only pointer.
  - On detached exit (detected via a periodic `kill(pid, 0)` liveness check or via file-based signaling — see design.md), transition to `completed`/`crashed`, emit the finish event, remove the meta file.
- **`server/index.ts`** startup: after `agentRunner` is constructed, call `agentRunner.adoptDetached()` to scan `.worktrees/`, adopt every live meta.
- **New helper `server/agents/detached-adopt.ts`**: encapsulates the scan + validate + adopt logic (kept out of the runner to keep `run()` legible).
- **`agents.yaml.example`**: comment block explaining the trade-off; a working example (Claude `-p` with `detached: true`).
- **`web/src/types.ts`**: `AgentPublic` gains `detached?: boolean` (informational; the UI does not gate on it, but the Agents page can show a `[detached]` badge next to the agent's row).
- **Cancel endpoint**: `agentRunner.cancel(id)` for a detached job sends `SIGTERM` to the recorded PID (still allowed; the user explicitly asked for it). Cleanup of the meta file happens on the resulting exit.
- **Docs**: `docs/architecture/parallel-shells.md` gains a section explaining detached mode and its trade-offs; the migration guide notes that `dev:test` is no longer strictly required to keep agents alive across saves.

## Out of scope

- **PTY-preserving detachment via tmux/screen/dtach**. Robust but adds an external dependency and a lot of glue. If we later need TTY-detecting CLIs to also survive restarts, that is a separate change on top of this one.
- **Adopting orphaned worktrees without a meta file**. A worktree can only be adopted if we wrote the breadcrumb. Ones from before this change land on disk but are not recovered (the existing `clean:worktrees` script handles them).
- **Live output backfill on adoption**. The runner tails the log file from EOF forward; historical output pre-restart lives in the log file, but the runner does not replay it into the ring buffer. The Diff tab still reflects the worktree's actual state, which is what matters for review.
- **Interactive stdin for adopted or detached jobs**. Detached mode is for `-p` / non-interactive runs by definition.
- **Cross-project detachment**. Only the current dashboard's project root is scanned for meta files.
