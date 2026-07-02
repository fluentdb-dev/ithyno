## 1. Server: worktree progress watcher module

- [x] 1.1 New `server/agents/worktree-progress.ts` exporting `startWorktreeProgressWatcher({ projectRoot, changeId, onProgress, onError }) → { dispose }`
- [x] 1.2 Watch `<projectRoot>/.worktrees/<changeId>/openspec/changes/<changeId>/tasks.md` via chokidar with `awaitWriteFinish` (short stability threshold)
- [x] 1.3 Debounce fs events beyond chokidar's stability window (~200ms) using a `setTimeout` accumulator, then read + parse + compare
- [x] 1.4 Track the last emitted `{done, total}` per watcher; suppress emissions that would repeat the same pair
- [x] 1.5 Errors reading/parsing the file are logged via `onError` callback and swallowed — transient bad state does not crash the runner

## 2. Runner integration

- [x] 2.1 Added `worktreeTasksWatcher?: WorktreeProgressHandle` and `lastWorktreeProgress?: Progress` to the internal `Job` shape in `server/agents/runner.ts`
- [x] 2.2 In `run()`, after pty spawn succeeds, call `startWorktreeProgressWatcher(...)` and store the handle on the job; `onProgress` emits `{ type: "worktree-progress-updated", jobId, changeId, progress }`
- [x] 2.3 In `finish()`, emit one final `worktree-progress-updated` from `lastWorktreeProgress` before disposing the watcher
- [x] 2.4 In `shutdown()`, iterate all jobs and dispose each watcher before SIGTERMing processes

## 3. Broadcaster / types

- [x] 3.1 Added `worktree-progress-updated` to the `ServerEvent` union in `server/index.ts`
- [x] 3.2 Web-side WS `onmessage` handler in `store.ts` accepts and dispatches the new event

## 4. Web store

- [x] 4.1 Added `worktreeProgress: Record<string, Progress>` state field
- [x] 4.2 `worktree-progress-updated` handler updates `worktreeProgress[changeId]`
- [x] 4.3 `agent-job-started` handler clears any stale `worktreeProgress[changeId]` from a previous run
- [x] 4.4 `clearWorktreeProgress(changeId)` action added; called from `Kanban.tsx` on successful merge / discard

## 5. Kanban card display

- [x] 5.1 `ChangeCard` reads `worktreeProgress[change.id]`; when present AND a non-cancelled job exists for this change, uses worktree progress instead of `change.progress`
- [x] 5.2 `"N/M (worktree)"` hint appears below the progress bar so the source is transparent
- [x] 5.3 `ProgressBar` receives the same numbers used in the hint (unified source)

## 6. Docs

- [x] 6.1 `docs/architecture/parallel-shells.md` — new "Live progress from the worktree" section explaining `-p` mode silence + tasks watcher

## 7. Tests

- [x] 7.1 `server/agents/worktree-progress.test.ts` — 4 unit tests on the count + change-detection contract (initial parse; tick advances; reordering does NOT emit; adding tasks changes total)
- [ ] 7.2 (Optional) chokidar-integration test deferred — the module's I/O boundary is covered by the manual verification path below

## 8. Verification

- [x] 8.1 Start `add-vscode-extension` in Worktree mode with the `claude -p` agent; card starts at `0/32`, ticks up as tasks complete
- [ ] 8.2 Cancel a running job — final progress freezes at the last emission, no further events arrive
- [ ] 8.3 Merge a completed job — `worktreeProgress[change.id]` clears and the card returns to the main-tree progress (which now reflects the merged state)
- [ ] 8.4 Server restart mid-run — new server has no running jobs; card falls back to main-tree progress (empty until merge)
- [ ] 8.5 Simulate rapid fs events (touch the file twice within debounce window) — exactly one emission surfaces
