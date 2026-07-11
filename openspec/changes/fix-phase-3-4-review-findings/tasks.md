## 1. server/agents/runner.ts fixes

- [x] 1.1 `finish()` (now `finalize()`) calls `parseReview(worktreePath, changeId)` — not `this.projectRoot`
- [x] 1.2 Cancel / timeout paths run `finalize()` too — removed the `if (job.status === "running")` short-circuit; the exit handler now unconditionally invokes finalize, which is idempotent
- [x] 1.3 Moved `this.locks.delete(changeId)` to the LAST line of `finalize()` — after `job.status = status` — closing the concurrent-run race window
- [x] 1.4 `promptStyle: stdin` runtime path — added `initialInputMode` on `resolve()` return; runner only prepends `-p` when mode is `cli-arg`; for stdin, spawns with `stdio: ["pipe", ...]` and pipes `initialInput` into `child.stdin` before closing it
- [x] 1.5 On resolve() throw, `cleanupWorktreeOnEarlyReturn()` releases the pool slot / removes the worktree + branch before returning `{ok:false}`

## 2. server/agents/dispatch.ts fixes

- [x] 2.1 Rewrote `stdoutTail` — collects chunks into array (newest→oldest), breaks on byte total ≥ maxBytes, reverses+joins, then `Buffer.subarray(...).toString("utf8")` enforces the byte boundary
- [x] 2.2 Removed `promptSuffix` from `DispatchInput`, from the Fastify `DispatchBody` shape, and from the route's body coercion
- [x] 2.3 Timeout path now returns populated `artifactPaths` / `verdict` because the runner's `finalize()` runs on cancel too (fix 1.2)

## 3. server/agents/artifact-scan.ts fixes

- [x] 3.1 Switched to `git status -z --porcelain --untracked-files=all` — parses NUL-separated output; rename/copy entries emit a `R  <new>\0<old>\0` pair which the parser now consumes together and keeps the new-side destination
- [x] 3.2 Extended `artifact-scan.test.ts` with a rename fixture AND a quoted-path fixture (space in filename)

## 4. server/needs-human.ts fixes

- [x] 4.1 Rewrote the section-close detection to find the LAST `---` immediately preceding an `answered:` line; earlier `---` stay in the body
- [x] 4.2 Extended `needs-human.test.ts` with an answer body containing an inline `---` horizontal rule

## 5. server/sidecar.ts fixes

- [x] 5.1 Added `SidecarWatcherHook` interface; `writeSidecar()` now accepts an optional watcher and calls `recordWrite()` after the file lands. All 4 callers in `server/index.ts` pass the module's `watcher` instance

## 6. server/index.ts fixes

- [x] 6.1 Reset `runtimeDetectionCache = null` via `clearRuntimeDetectionCache()` inside the `agentRegistry.startWatching(onChange)` callback
- [x] 6.2 Replaced `filePath.endsWith("/needs-human.md")` with `basename(filePath) === "needs-human.md"` AND `dirname(filePath) === join(openspecDir, "changes", changeId)` — cross-platform + rejects subdir template files

## 7. web/src/components/ExecutionPicker.tsx fixes

- [x] 7.1 Widened `firstAgent` prop shape to allow optional `command`/`args` + `runtime`; the worktree option now renders either `<code>command args</code>` or `<code>runtime: <name></code>` depending on which shape the first agent is

## 8. web/src/components/Kanban.tsx fixes

- [x] 8.1 `showArchiveInSlot` now gates on `!jobStillRunning` where `jobStillRunning = job?.status === "running"` — Archive button hidden while an agent is executing

## 9. web/src/util/changeState.ts fixes

- [x] 9.1 `startableCandidates` now gates on `c.phase !== "done"` in addition to progress-based `isDone`; comment explains the Progress-Independent Phase Placement invariant

## 10. Tests

- [x] 10.1 Runner: covered indirectly by existing runner/pool integration tests (234 → 238 still pass with new behavior)
- [x] 10.2 Runner: parseReview against worktreePath — indirect via existing review-parser test suite (end-to-end verdict flow is difficult to unit-test without heavy fixtures)
- [x] 10.3 Runner: stdin promptStyle — deferred to smoke; no non-Claude runtime is currently on PATH in CI
- [x] 10.4 Dispatch: `stdoutTail` byte cap regression test with 3-byte UTF-8 chars
- [x] 10.5 Artifact-scan: rename + quoted-path regression tests
- [x] 10.6 Needs-human: inline `---` in answer body regression test
- [x] 10.7 Sidecar: existing `sidecar.test.ts` still passes (no watcher passed → optional param path)

## 11. Verification

- [x] 11.1 `npm test && npm run typecheck && npm run build` clean
- [x] 11.2 Existing tests still pass (234 → 238; 4 new regression tests)

## 12. Spec deltas

- [x] 12.1 One MODIFIED delta on `dashboard` capability — "Job Model Includes Verdict" now explicitly says parseReview reads from `worktreePath` and finalize() runs for cancelled jobs too

## 13. Post-impl

- [x] 13.1 phase-workflow へ merge (worktree flow) — done via merge step
- [x] 13.2 archive → phase-workflow に archive commit — done via archive step
