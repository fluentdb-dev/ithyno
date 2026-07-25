# Outcome — annotate-cards-with-worker-job-state

Phase 2 of the Phase-view trio. Extends the shared `<KanbanCard>` so every
card reports what its dispatched worker is doing right now, in both the
Board view and the Phase view.

## ✅ Worked

- **The `<KanbanCard>` extraction from `add-phase-lane-view-toggle` paid
  off exactly as designed.** The whole feature landed in one shared
  component plus a one-line prop at each of the two call sites. No logic
  is duplicated between `Kanban.tsx` and `PhaseLaneBoard.tsx`, which is
  literally the "Card render identity between views" scenario in the spec.
- **Splitting the render decision tree into a pure
  `workerStateView(job, laneContext, now)`.** This repo's vitest runs in
  the `node` environment with no jsdom and no testing-library, so a
  `.test.tsx` mounting test was never going to run. Pushing the branch
  table into a pure function gave 10 direct branch tests and left the
  component as a thin renderer — the same shape `PhaseLaneBoard.test.ts`
  already uses for `bucketizeByPhase`.
- **Injectable `now`.** Both `formatElapsedSince(startedMs, now)` and
  `workerStateView(job, lane, now)` take an explicit clock, so the grace
  window and the elapsed formatter are testable without fake timers.
- **`laneContext` defaults to `"board"`.** Making the prop optional meant
  the `PhaseLaneBoard.tsx` edit is a single added line, which keeps the
  merge with the concurrently-in-flight
  `dynamic-phase-lanes-from-agents-roles` (which rewrites that file's lane
  derivation) as clean as possible.

## ⚠️ Surprises

- **Task 1.2's premise was false.** Finished jobs never drop out of
  `jobByChange` — `store.setJobFinished` only flips `status` and stamps
  `finishedAt`, and the entry survives until the server emits
  `agent-job-removed` or the page reloads. So the "hold recently-finished
  jobs for 30 s" work was unnecessary; the spec's retention requirement is
  satisfied a fortiori.
- **…and implementing 1.2 literally would have been a regression.** The
  same `jobByChange` map drives the card's Merge / View diff / Discard
  buttons and the `perCardStartEligible(slot, !!job)` gate. Evicting a
  completed job after 30 s would make the Merge affordance vanish and
  resurrect the Start button on a change with an unmerged worktree. The
  transient-ness of the "done" checkmark therefore lives at *render* time
  (`DONE_GRACE_MS` in `WorkerStateIndicator`), not in the data map. A
  comment in `useKanbanActions.tsx` records this so the next reader
  doesn't "fix" it.
- **`@keyframes pulse` was already taken three times over** —
  `agentpulse`, `terminal-reconnect-pulse`, `onboarding-pulse`. Named the
  new one `workerpulse` rather than the `pulse` the tasks file suggested.
- **`AgentBadge`'s removal orphaned its CSS.** `grep` says `.agent-badge`
  / `.agent-pulse` now have no consumer anywhere in `web/src`. Left the
  rules in place (harmless, and pruning them is out of this change's
  scope) — see follow-ups.

## 🔁 Differently

- **Would have inspected the store before writing tasks 1.1–1.3.** A
  30-second look at `store.ts::setJobFinished` would have replaced three
  tasks with one sentence, and would have surfaced the
  Merge-button-regression hazard at propose time rather than impl time.
- **The tasks file specified filenames (`WorkerStateIndicator.test.tsx`)
  that the repo's test config cannot pick up.** Worth a propose-time check
  of `vitest.config.ts`'s `include` glob whenever a change adds a test
  file.
- **`cancelled` semantics are slightly inconsistent between the spec and
  task 7.6.** The spec's requirement list gives `cancelled` no time window
  ("muted gray dot + 'cancelled' label"), but manual task 7.6 says
  "briefly, then base". Implemented per the requirement — `cancelled`
  persists, only `completed` expires. Worth confirming during the manual
  pass; if the transient reading is preferred, extending the grace window
  to `cancelled` is a two-line change.

## 🌱 Follow-ups

- **Manual verification (tasks 7.5 / 7.6 / 7.7) is still open.** It needs
  a live `/ithy-opsx:dispatch` plus a deliberate SIGKILL, so it is left to
  the human or verify pass rather than faked.
- **Prune the dead `.agent-badge` / `.agent-pulse` CSS** (~40 lines in
  `styles.css`) in a later tidy-up change, once no in-flight branch still
  references them.
- **The elapsed clock ticks at 30 s.** For a worker that has been running
  12 seconds the card can read `"0s"` for up to half a minute. If that
  reads as "stuck", drop `TICK_MS` to 5 s for the first minute — the
  formatter already supports it, only the interval is coarse.
- **Manager-activity visualization** (dispatching / waiting / cleanup) is
  Phase 3 and deliberately untouched here, as is the desktop-notification
  work in `add-desktop-notifications`.
- **Clicking the agent name could deep-link to the Agents page / job
  output.** The proposal explicitly listed this as a non-goal, but the
  indicator is now the natural anchor for it.
