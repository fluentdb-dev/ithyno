# Tasks

## 1. Job data flow — hold recently-finished

- [ ] 1.1 Inspect `web/src/hooks/useKanbanActions.tsx` (or wherever `jobByChange` is built). Confirm whether finished jobs stay in the map for a short grace period after `finishedAt`.
- [ ] 1.2 If they drop immediately, add a 30-second grace window: keep a completed/crashed/cancelled job in `jobByChange` for 30 s post-`finishedAt`, then drop.
- [ ] 1.3 The grace window is implemented client-side (no server change) — either via a `setTimeout` per finished job OR via a periodic re-filter (`useEffect` with `setInterval`).

## 2. Elapsed-time helper

- [ ] 2.1 New helper `formatElapsed(startedMs: number): string` in `web/src/util/formatElapsed.ts`. Format rules:
  - `< 60s` → `"12s"`
  - `< 1h` → `"1m 5s"` (drop leading zeros)
  - `< 24h` → `"3h 12m"`
  - `≥ 24h` → `"1d 4h"`
- [ ] 2.2 Unit tests in `formatElapsed.test.ts` — 5 cases covering each range.

## 3. WorkerStateIndicator component

- [ ] 3.1 New component `web/src/components/WorkerStateIndicator.tsx`. Props: `{ job: JobSummary | undefined; laneContext: "board" | "phase" }`.
- [ ] 3.2 Render decision tree:
  - No job + `laneContext === "phase"` → muted `<span class="worker-state-dot queued" />` + "queued" text.
  - No job + `laneContext === "board"` → render nothing (return `null`).
  - `job.status === "running"` → animated pulse dot + `{job.agentName} · {formatElapsed(now - job.startedAt)}`. Wrap in `useEffect` that ticks every 30 s to force re-render.
  - `job.status === "completed"` → gray checkmark + "done" text. No timer.
  - `job.status === "cancelled"` → gray dot + "cancelled". No timer.
  - `job.status === "crashed"` → red dot + "crashed"; tooltip = `job.exitCode`.
  - `job.status === "orphaned"` → red dot + "orphaned"; tooltip = worktree path.

## 4. Integrate into KanbanCard

- [ ] 4.1 `web/src/components/KanbanCard.tsx` — replace the existing `AgentBadge` (or extend it) with `<WorkerStateIndicator job={job} laneContext={...} />`.
- [ ] 4.2 Thread the `laneContext` prop through:
  - `KanbanBoard` calls `<KanbanCard ... />` with `laneContext="board"`.
  - `PhaseLaneBoard` calls `<KanbanCard ... />` with `laneContext="phase"`.
- [ ] 4.3 The existing `AgentBadge` may be removed or kept as a wrapper if simpler; final form left to impl-time judgment.

## 5. CSS

- [ ] 5.1 `web/src/styles.css`:
  - `.worker-state-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }`
  - `.worker-state-dot.running { background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }`
  - `.worker-state-dot.completed { background: var(--success); }`
  - `.worker-state-dot.cancelled { background: var(--muted); }`
  - `.worker-state-dot.crashed, .worker-state-dot.orphaned { background: var(--red); }`
  - `.worker-state-dot.queued { background: var(--muted); opacity: 0.5; }`
  - `.worker-state-elapsed { color: var(--muted); font-size: 11px; margin-left: 4px; }`
  - `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`

## 6. Tests

- [ ] 6.1 `web/src/util/formatElapsed.test.ts` (from 2.2).
- [ ] 6.2 `web/src/components/WorkerStateIndicator.test.tsx` — 6 tests, one per branch of the render decision tree (no-job-phase, no-job-board, running, completed, crashed, orphaned).

## 7. Verification

- [ ] 7.1 `npm run openspec -- validate annotate-cards-with-worker-job-state --strict` passes.
- [ ] 7.2 `npm test` passes (accepting the known-unrelated `scripts/build-icons.test.mjs` failure on Node 25.8).
- [ ] 7.3 `npm run typecheck` passes.
- [ ] 7.4 `npm run build` passes.
- [ ] 7.5 Manual: dispatch a code worker on a change → card shows animated pulse + agent name + elapsed time. Worker finishes → card shows checkmark for ~30 s, then reverts to base.
- [ ] 7.6 Manual: cancel a running worker → card shows "cancelled" briefly, then base.
- [ ] 7.7 Manual: kill a worker process externally (SIGKILL) → card eventually shows "crashed" or "orphaned".
- [ ] 7.8 Write `openspec/changes/annotate-cards-with-worker-job-state/outcome.md`.
