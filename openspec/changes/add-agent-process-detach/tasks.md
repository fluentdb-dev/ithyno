## 1. Registry: `detached` field

- [x] 1.1 Add `detached?: boolean` to `AgentDef` in `server/agents/registry.ts`; parse it as strict boolean; reject non-boolean values in `validateAgents`
- [x] 1.2 Include `detached` in `AgentPublic` (`server/model.ts` and `web/src/types.ts`) so consumers can render a badge
- [x] 1.3 Warn (do not fail) on load when `detached: true` is set on Windows (`process.platform === "win32"`)

## 2. Runner: detached spawn path

- [x] 2.1 New `server/agents/detached-runner.ts` module encapsulating the file-based spawn, meta-file write, unref, and log-file open — keeps `runner.ts` legible
- [x] 2.2 In `runner.ts run()`, branch on `def.detached`: if true, delegate to the detached module and skip the pty path
- [x] 2.3 Detached spawn opens `<worktree>/.agent.log` for appending (create + truncate on fresh spawn; append on adoption), spawns `child_process.spawn(cmd, args, { detached: true, cwd, env, stdio: ["ignore", logFd, logFd] })`, then calls `child.unref()`
- [x] 2.4 After spawn, write `<worktree>/.agent-meta.json` with `{ jobId, changeId, agentName, pid, startedAt, logPath }`
- [x] 2.5 Mark the job as `detached: true` on `Job` and expose it through `JobSummary`

## 3. Runner: log tail as output pipe

- [x] 3.1 New helper `startLogTail(logPath, onData) → { dispose }` using chokidar `awaitWriteFinish` + incremental reads (track file byte offset, read the delta on each event, emit each line as a `stream: "stdout"` chunk)
- [x] 3.2 Attach the tail on fresh spawn AND on adoption; same code path
- [x] 3.3 Dispose the tail in `finish()`

## 4. Runner: exit detection for detached

- [x] 4.1 Per-detached-job interval (`setInterval`, ~3s): call `process.kill(pid, 0)`; on `ESRCH` transition the job to `completed` with `exitCode: null` and invoke `finish()`
- [x] 4.2 Clear the interval in `finish()` and in `shutdown()` (for future PTY-mode consistency; detached path exits via the poll but cleanup is harmless)

## 5. Runner: shutdown skips detached

- [x] 5.1 `shutdown()` iterates jobs, kills only PTY processes; detached job pids are left alone; watchers (worktree tasks + log tail) are still disposed
- [x] 5.2 Meta files remain on disk after shutdown

## 6. Runner: adoption at startup

- [x] 6.1 New `agentRunner.adoptDetached()` method: scan `<projectRoot>/.worktrees/*/.agent-meta.json`, `JSON.parse` each, validate (fields present, pid alive via `kill(pid, 0)`, worktree dir exists, cmdline cross-check for pid reuse)
- [x] 6.2 On successful validation, insert `Job` entry, start log tail, start worktree-tasks watcher, start exit-detection interval, emit `agent-job-started`
- [x] 6.3 On any validation failure, `unlink` the meta file and skip
- [x] 6.4 `server/index.ts` calls `agentRunner.adoptDetached()` after construction, before wiring the WS server

## 7. Runner: cancel + input for detached

- [x] 7.1 `cancel(id)` for a detached job: send SIGTERM to the recorded pid (via `process.kill(pid, "SIGTERM")`); exit detector reaps
- [x] 7.2 `writeInput(id, ...)` for a detached job: return `{ ok: false, status: 409, reason: "This job is detached; interactive input is disabled." }`

## 8. Web surface

- [x] 8.1 `JobSummary` type mirrors the `detached?: boolean` field
- [x] 8.2 Agents page renders a `[detached]` badge next to the agent name for detached jobs
- [ ] 8.3 `JobInputField` — already removed by `add-agent-xterm-output`; the xterm view stays interactive but the server enforces the 409 (client shows a toast)

## 9. Docs

- [x] 9.1 `docs/architecture/parallel-shells.md` — new "Detached agents survive server restarts" section
- [x] 9.2 `agents.yaml.example` — commented `detached: true` example next to the Claude entry; explain the trade-off
- [x] 9.3 `docs/migration-guide.md` — note that `dev:test` is no longer strictly required for `-p` mode Claude runs (the detach handles it)

## 10. Tests

- [x] 10.1 `server/agents/detached-adopt.test.ts` — unit tests for the adoption validator: alive-pid + valid meta ⇒ adopt; dead pid ⇒ unlink; missing worktree ⇒ unlink; cmdline mismatch ⇒ unlink
- [x] 10.2 `server/agents/detached-runner.test.ts` — spawn a trivial `bash -c "sleep 5 && echo done"` (or `node -e "setTimeout(()=>console.log('done'),5000)"`) with `detached: true`, assert meta file appears, kill the parent-node-child pid via test harness, assert child survives the harness "shutdown", clean up
- [x] 10.3 Log tail unit test — feed a stub emitter, assert `stdout` chunks arrive in order

## 11. Verification

- [ ] 11.1 Set `detached: true` on the Claude entry; Start a change (Worktree); verify `<worktree>/.agent-meta.json` exists with the expected shape
- [ ] 11.2 Edit a `server/*.ts` file to force a `dev` restart — verify the detached Claude survives; Agents page re-populates with `status: running` post-restart
- [ ] 11.3 Kill the detached agent from another terminal (`kill <pid>`) — Agents page shows `completed` within one poll interval; meta file is gone
- [ ] 11.4 Try to send input to a detached job from the xterm view — 409 comes back with the "detached" reason
- [ ] 11.5 Turn `detached: true` off; Start again; verify the old PTY behavior is unchanged
