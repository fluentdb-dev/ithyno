## 1. server/agents/runner.ts fixes

- [ ] 1.1 `finish()` calls `parseReview(worktreePath, changeId)` — not `this.projectRoot`
- [ ] 1.2 Cancel / timeout paths run `finalize()` too — remove the `if (job.status === "running")` short-circuit; honor prior cancel status but always run side-effects (artifact scan, verdict parse, pool.release, processes.delete, agent-job-finished emit)
- [ ] 1.3 Move `this.locks.delete(changeId)` to the LAST line of `finalize()` — after `job.status = status` — to close the concurrent-run race window
- [ ] 1.4 `promptStyle: stdin` runtime path — do NOT unshift `-p`; spawn with `stdio: ["pipe", "pipe", "pipe"]`; write `resolved.initialInput` to `child.stdin` and end it
- [ ] 1.5 On resolve() throw, clean up worktree (pool.release or worktree remove + branch delete) before returning `{ok:false}`

## 2. server/agents/dispatch.ts fixes

- [ ] 2.1 Rewrite `stdoutTail` — collect chunks into array (newest→oldest), break on byte total ≥ maxBytes, reverse+join, then Buffer.subarray trim to enforce byte boundary
- [ ] 2.2 Remove `promptSuffix` from `DispatchInput` type, dispatch() signature, and any downstream forwarding (server/index.ts route, web/src/api.ts if present)
- [ ] 2.3 Timeout path: after `runner.cancel()`, wait for `finalize()` to complete before reading `artifactPaths` / `verdict` — (naturally resolved by fix 1.2 running finalize() on cancel; verify polling loop reads the populated fields)

## 3. server/agents/artifact-scan.ts fixes

- [ ] 3.1 Switch to `git status -z --porcelain --untracked-files=all` — parse NUL-separated output; handle rename entries (R format = new NUL old) and quoted paths (not applicable with -z)
- [ ] 3.2 Extend `artifact-scan.test.ts` with a rename fixture

## 4. server/needs-human.ts fixes

- [ ] 4.1 Parse the LAST `---` immediately preceding the `answered:` footer as the section-close; earlier `---` stay in the body
- [ ] 4.2 Extend needs-human parser tests with an answer body containing an inline `---`

## 5. server/sidecar.ts fixes

- [ ] 5.1 Add `recordSidecarWrite(path)` (or equivalent) that the watcher consults; call from `writeSidecar` to prevent self-echo → duplicate broadcast

## 6. server/index.ts fixes

- [ ] 6.1 Reset `runtimeDetectionCache = null` on `agentRegistry` config reload (subscribe to the same event or hook `onReload`)
- [ ] 6.2 Replace `filePath.endsWith("/needs-human.md")` with `path.basename(filePath) === "needs-human.md"` AND enforce the path is exactly `<openspecDir>/changes/<changeId>/needs-human.md` (length-3 relative parts)

## 7. web/src/components/ExecutionPicker.tsx fixes

- [ ] 7.1 Guard `firstAgent.command`/`args`; fall back to `runtime: <name>` label for runtime-backed agents

## 8. web/src/components/Kanban.tsx fixes

- [ ] 8.1 `showArchiveInSlot` requires `!job || job.status !== "running"` — Archive button hidden while an agent is still executing

## 9. web/src/util/changeState.ts fixes

- [ ] 9.1 `startableCandidates` gates on `change.phase !== "done"` in addition to `!isDone` — phase is authoritative over progress

## 10. Tests

- [ ] 10.1 Runner: cancel populates artifactPaths + releases pool + emits `agent-job-finished` (fix 1.2)
- [ ] 10.2 Runner: parseReview happens against worktreePath (fix 1.1)
- [ ] 10.3 Runner: stdin promptStyle runtime writes to child.stdin (fix 1.4)
- [ ] 10.4 Dispatch: stdoutTail truncates by byte, not char (fix 2.1)
- [ ] 10.5 Artifact-scan: rename entries surface as new path (fix 3.1)
- [ ] 10.6 Needs-human: inline `---` in answer body preserved (fix 4.1)
- [ ] 10.7 Sidecar: writeSidecar → no duplicate broadcast (fix 5.1)

## 11. Verification

- [ ] 11.1 `npm test && npm run typecheck && npm run build` clean
- [ ] 11.2 Existing 234 tests still pass (fixes must be regressions of new behavior, not new)

## 12. Spec deltas

- [ ] 12.1 None — all fixes align to existing requirements; validation should pass without a spec/ folder

## 13. Post-impl

- [ ] 13.1 phase-workflow へ merge (worktree flow)
- [ ] 13.2 archive → phase-workflow に archive commit
