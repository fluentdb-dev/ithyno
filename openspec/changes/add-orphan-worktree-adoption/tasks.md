## 1. Types

- [x] 1.1 Widened `JobStatus` in `server/agents/runner.ts` and `web/src/types.ts` to include `"orphaned"`
- [x] 1.2 Extended `isPendingMergeOrDiscard` in `web/src/components/Kanban.tsx` to include `"orphaned"`
- [x] 1.3 Extended `isMergeable` similarly

## 2. Server: adopt helper

- [x] 2.1 New `server/agents/adopt-orphans.ts` exporting `listOrphanWorktrees(projectRoot)` and the pure `parsePorcelain(stdout, projectRoot)` used by the unit tests
- [x] 2.2 Defensive parser: unknown field lines ignored, malformed blocks skipped, detached / non-agent branches filtered out

## 3. Runner: adoption method

- [x] 3.1 `agentRunner.adoptOrphanWorktrees()` iterates orphans, skips changes already locked (by fresh spawn or detached adoption), inserts synthetic `Job` (agentName: `"orphan"`, status: `"orphaned"`) and emits `agent-job-started`
- [x] 3.2 Attaches `worktreeTasksWatcher` on each adopted job — reuses the same helper from `add-worktree-tasks-watcher`
- [x] 3.3 Watcher's initial parse (chokidar's `ignoreInitial: false`) produces the first `worktree-progress-updated` naturally

## 4. Runner: cancel + input refusal

- [x] 4.1 `cancel(id)` refuses `"orphaned"` with `"Orphaned worktree has no process to cancel — Discard or Merge instead."`
- [x] 4.2 `writeInput(id, ...)` returns HTTP 409 with the matching orphan reason

## 5. Server startup wiring

- [x] 5.1 `server/index.ts` calls `void agentRunner.adoptOrphanWorktrees()` immediately after `new AgentRunner(...)`
- [ ] 5.2 (Deferred to `add-agent-process-detach` landing) run detached adoption first so orphan adoption fills only the changes not already claimed

## 6. Web: Kanban card badge + gating

- [x] 6.1 `AgentBadge` renders `orphaned` badge for `job.status === "orphaned"` (amber styling)
- [x] 6.2 Merge and Discard render (via extended `isMergeable`)
- [x] 6.3 Cancel is hidden (existing `job.status === "running"` gate covers this)

## 7. Web: xterm output view

- [ ] 7.1 (Deferred) `[orphan] Worktree adopted from disk` hint line in `AgentOutputView` — the seed path already handles undefined outputs slice; the Diff tab is the primary way to review adopted worktrees, so this hint is polish, not required

## 8. Docs

- [x] 8.1 `docs/architecture/parallel-shells.md` — new "Orphan worktrees are adopted on server startup" section
- [ ] 8.2 (Deferred) `docs/migration-guide.md` troubleshooting row swap — the current row still applies for VERY old worktrees; leave it and add a positive note in a follow-up

## 9. Tests

- [x] 9.1 `server/agents/adopt-orphans.test.ts` — 7 unit tests: matches, outside `.worktrees/`, wrong branch, wrong dir name, malformed blocks, detached record, empty input

## 10. Verification

- [ ] 10.1 With `.worktrees/add-electron-shell` and `.worktrees/add-vscode-extension` present, restart the server; both cards appear in IN-PROGRESS with `Orphaned` badge and Merge/Discard buttons
- [ ] 10.2 Merge from Kanban → worktree branch merges into main; worktree remains until Discard
- [ ] 10.3 Discard → `git worktree remove --force` + `git branch -D` fire; state clears
- [ ] 10.4 Cancel curl on an orphaned job → server returns the explanatory refusal
- [ ] 10.5 Manual tick in the orphan's tasks.md → card progress moves
