## 1. Server: watcher extension

- [x] 1.1 `server/agents/worktree-progress.ts::startWorktreeProgressWatcher` — add `onUnlink?: () => void` to the options type
- [x] 1.2 Register `watcher.on("unlink", ...)` — fires the callback exactly once, guarded by the existing `disposed` flag so a late fire during dispose is a no-op
- [x] 1.3 No other changes to the `add` / `change` / `error` handlers or the debounced emit path

## 2. Server: runner cleanup on unlink

- [x] 2.1 Locate BOTH watcher attachment sites in `server/agents/runner.ts` — fresh spawn (in `run()`) and orphan adoption (in `adoptOrphanWorktrees()`)
- [x] 2.2 In both sites, supply `onUnlink: () => this.removeJobExternally(jobId, changeId)`
- [x] 2.3 New private method `removeJobExternally(jobId, changeId)`:
  - `this.jobs.delete(jobId)`
  - `this.locks.delete(changeId)` (guarded — only if it still points at this jobId)
  - Dispose the job's worktree tasks watcher handle if still present
  - Emit `{ type: "agent-job-removed", jobId, changeId }`
- [x] 2.4 If the job is currently `running` and its process is still alive, DO NOT kill it — external worktree removal on a live agent is a user error we surface, not one we compound. Log a warning and still remove the job map entry (the process will detect its own missing cwd and exit soon anyway)

## 3. Server: WS event type

- [x] 3.1 `server/index.ts::ServerEvent` union — add `{ type: "agent-job-removed"; jobId: string; changeId: string }`
- [x] 3.2 `server/agents/runner.ts::RunnerEvent` union — add the same variant so the runner's emit can type-check

## 4. Client: store handler

- [x] 4.1 `web/src/store.ts` — add `agent-job-removed` handler in the WS message switch
- [x] 4.2 Handler body: delete `jobs[jobId]`, delete `jobOutputs[jobId]`, delete `worktreeProgress[changeId]` (the last one only if the changeId matches)
- [x] 4.3 Verify no client render paths assume the job still exists after removal (grep for `s.jobs[<id>]!` etc.)

## 5. Spec delta

- [x] 5.1 `openspec/changes/add-worktree-external-discard-detection/specs/dashboard/spec.md`: MODIFIED requirement covering the external-discard detection + `agent-job-removed` broadcast + Kanban card returning to TODO

## 6. Verification

- [x] 6.1 Start an agent under Worktree mode; while it's running, `git worktree remove --force .worktrees/<id> && git branch -D agent/<id>` in a terminal → within a few seconds the Agents page's job entry disappears and the Kanban card returns to TODO (no server restart needed)
- [ ] 6.2 Adopt an orphan on server startup (existing behavior), then externally discard it → same outcome
- [x] 6.3 UI-driven Discard still works — regression check: the existing `agent-job-finished` flow isn't accidentally superseded
- [ ] 6.4 Direct `unlink` of `tasks.md` alone (without removing the worktree dir) → the runner still cleans up (documented behavior: `unlink` on the watched file is the trigger; the enclosing directory is optional context)
- [x] 6.5 `npm test && npm run typecheck && npm run build` all pass
