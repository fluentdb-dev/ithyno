# Tasks

## 1. Job data flow — hold recently-finished

- [x] 1.1 Inspect `web/src/hooks/useKanbanActions.tsx` (or wherever `jobByChange` is built). Confirm whether finished jobs stay in the map for a short grace period after `finishedAt`.
  - **Finding**: they stay indefinitely. `store.setJobFinished` only flips `status` and stamps `finishedAt`; the entry survives in `s.jobs` until the server emits `agent-job-removed` or the page reloads. The spec's "retained for a 30-second grace window" is therefore already satisfied.
- [x] 1.2 ~~If they drop immediately, add a 30-second grace window~~ — precondition false (see 1.1). Adding an eviction here would regress the Merge / View diff / Discard affordances, which read the same map. The transient-ness of the "done" state is enforced at render time by `WorkerStateIndicator`'s `DONE_GRACE_MS` instead; a comment in `useKanbanActions.tsx` records the reasoning.
- [x] 1.3 The grace window is implemented client-side (no server change) — `DONE_GRACE_MS` in `WorkerStateIndicator.tsx`, woken by a single `setTimeout` armed for the remaining window.

## 2. Elapsed-time helper

- [x] 2.1 New helper `formatElapsed(startedMs: number): string` in `web/src/util/formatElapsed.ts`. Format rules:
  - `< 60s` → `"12s"`
  - `< 1h` → `"1m 5s"` (drop leading zeros)
  - `< 24h` → `"3h 12m"`
  - `≥ 24h` → `"1d 4h"`
  - Signature note: `formatElapsed(elapsedMs)` takes a duration; `formatElapsedSince(startedMs, now)` is the timestamp wrapper (keeps `now` injectable for tests).
- [x] 2.2 Unit tests in `formatElapsed.test.ts` — 6 cases covering each range plus the clock-skew clamp.

## 3. WorkerStateIndicator component

- [x] 3.1 New component `web/src/components/WorkerStateIndicator.tsx`. Props: `{ job: JobSummary | undefined; laneContext: "board" | "phase" }`.
- [x] 3.2 Render decision tree (extracted to the pure `workerStateView(job, laneContext, now)` so it is unit-testable under this repo's node-environment vitest setup):
  - No job + `laneContext === "phase"` → muted `<span class="worker-state-dot queued" />` + "queued" text.
  - No job + `laneContext === "board"` → render nothing (return `null`).
  - `job.status === "running"` → animated pulse dot + `{job.agentName} · {formatElapsed(now - job.startedAt)}`. `useEffect` ticks every 30 s to force a re-render.
  - `job.status === "completed"` → gray checkmark + "done" text; falls back to the idle branch once `DONE_GRACE_MS` lapses.
  - `job.status === "cancelled"` → gray dot + "cancelled". No timer.
  - `job.status === "crashed"` → red dot + "crashed"; tooltip = `exit code: {job.exitCode}`.
  - `job.status === "orphaned"` → red dot + "orphaned"; tooltip = worktree path.

## 4. Integrate into KanbanCard

- [x] 4.1 `web/src/components/KanbanCard.tsx` — `AgentBadge` replaced by `<WorkerStateIndicator job={job} laneContext={laneContext} />`.
- [x] 4.2 Thread the `laneContext` prop through:
  - `KanbanBoard` calls `<KanbanCard ... laneContext="board" />`.
  - `PhaseLaneBoard` calls `<KanbanCard ... laneContext="phase" />` (one-line edit only, to stay merge-clean with `dynamic-phase-lanes-from-agents-roles`).
- [x] 4.3 `AgentBadge` removed. The `.agent-badge` / `.agent-pulse` CSS is left in `styles.css` (now unused, but out of scope to prune).

## 5. CSS

- [x] 5.1 `web/src/styles.css` — `.worker-state*` block added next to the old `.agent-badge` rules:
  - `.worker-state-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }`
  - `.worker-state-dot.running { background: var(--accent); animation: workerpulse 1.5s ease-in-out infinite; }` (renamed from `pulse` — three `*pulse` keyframes already exist in this stylesheet)
  - `.worker-state-dot.completed { background: var(--success); }`
  - `.worker-state-dot.cancelled { background: var(--muted); }`
  - `.worker-state-dot.crashed, .worker-state-dot.orphaned { background: var(--red); }`
  - `.worker-state-dot.queued { background: var(--muted); opacity: 0.5; }`
  - `.worker-state-elapsed { color: var(--muted); font-size: 11px; }`
  - `@keyframes workerpulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }` + a `prefers-reduced-motion` opt-out
  - Plus per-kind chip tinting (`.worker-state-running/.completed/.crashed/.orphaned/.queued`) so the badge matches the existing card visual language.

## 6. Tests

- [x] 6.1 `web/src/util/formatElapsed.test.ts` (from 2.2) — 6 tests.
- [x] 6.2 `web/src/components/WorkerStateIndicator.test.ts` — 10 tests covering every branch of the render decision tree (no-job-phase, no-job-board, running, completed-fresh, completed-expired, completed-without-finishedAt, cancelled, crashed, orphaned, terminal-states-in-both-lanes). Filename is `.test.ts` not `.test.tsx`: `vitest.config.ts` globs `web/src/**/*.test.ts` in the `node` environment and the repo has no jsdom / testing-library, so the tests target the pure `workerStateView()` split (same pattern as `PhaseLaneBoard.test.ts`).

## 7. Verification

- [x] 7.1 `npm run openspec -- validate annotate-cards-with-worker-job-state --strict` passes.
- [x] 7.2 `npm test` passes — 543 passed / 1 skipped; the only failure is the known-unrelated `scripts/build-icons.test.mjs` `sharp` ERR_MODULE_NOT_FOUND on Node 25.8.
- [x] 7.3 `npm run typecheck` passes.
- [x] 7.4 `npm run build` passes.
- [ ] 7.5 Manual: dispatch a code worker on a change → card shows animated pulse + agent name + elapsed time. Worker finishes → card shows checkmark for ~30 s, then reverts to base. *(Requires a live dispatch — left for the human/verify pass.)*
- [ ] 7.6 Manual: cancel a running worker → card shows "cancelled" briefly, then base. *(Same.)*
- [ ] 7.7 Manual: kill a worker process externally (SIGKILL) → card eventually shows "crashed" or "orphaned". *(Same.)*
- [x] 7.8 Write `openspec/changes/annotate-cards-with-worker-job-state/outcome.md`.
