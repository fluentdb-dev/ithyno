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

---

## Round 2 — phase-aware `completed` suppression

### The finding

Review returned `needs-rework` with one `severity: high` item against
`WorkerStateIndicator.tsx:77`: the `completed` branch keyed only on
`job.status` / `finishedAt`, so a card could keep showing `done ✓` for up
to 30 seconds after the change had already advanced to its next phase.

### The adjudication

The finding exposed a disagreement between the change's own artifacts:

- `proposal.md` ("KanbanCard extension") stated the phase-aware rule —
  *"`completed` (and change.phase advanced) → not shown (transient state
  absorbed by the phase update)"*.
- `specs/dashboard/spec.md` stated only the time rule — *"visible for up
  to 30 seconds after `finishedAt`"*, with no phase condition.

Round 1 implemented the spec, not the proposal. The Manager adjudicated in
favor of the proposal: **implement the phase-aware rule and tighten the
spec to match**, because a lingering "done ✓" on a card that has already
moved lanes misreports the card's current state — the exact failure this
change exists to fix. The `completed` state now requires BOTH halves:
inside `DONE_GRACE_MS` **and** the change still in the stage its worker
finished in.

The Manager also explicitly accepted round 1's decision to decline tasks
1.2 / 1.3 (30-second eviction from `jobByChange`) — the same map gates
Merge / View diff / Discard and `perCardStartEligible`, so evicting would
drop the Merge affordance and resurrect Start on an unmerged worktree.
Left as-is; the spec's retention sentence was reworded to say so plainly
instead of implying the entry gets dropped.

### What changed

- **`web/src/phases.ts`** — extracted `laneForPhase(phase, priorPhase)`,
  the pipeline-stage resolver that was inlined in
  `PhaseLaneBoard.bucketizeByPhase()`. It is now the single owner of the
  "known phase → that lane; `needs-human` → `priorPhase`; anything else →
  `proposed`" rules, shared by lane placement and stage comparison.
- **`web/src/store.ts`** — new `jobStageAtFinish: Record<jobId, Phase>`.
  `setJobFinished` stamps the change's stage at the instant the finish is
  observed; `agent-job-removed` drops the entry with the job.
- **`WorkerStateIndicator`** — new `StageSignal { current?, atFinish? }`
  threaded through `workerStateView()`, with an exported pure
  `stageAdvanced()` making the suppression decision.
- **`KanbanCard`** — reads the snapshot and passes both stages down.
- **Spec + tasks** — the `completed` bullet, the "Successful completion"
  scenario, a new "Phase advance retires the checkmark early" scenario,
  and a new task group 3b.

### ⚠️ Surprises (round 2)

- **A `JobSummary` carries no role.** The obvious reading of "the stage
  the finished job belonged to" — map the job's dispatch role (`code` /
  `review` / `verify`) to a phase — is not derivable client-side: the job
  records `agentName`, not the role it was dispatched under, and a
  multi-role agent makes the reverse lookup ambiguous. Nor does a phase
  carry a timestamp, so "did the phase move after the job finished?"
  cannot be answered from the two records alone.
- **So the stage had to be observed, not derived.** Snapshotting the
  change's stage at the moment `agent-job-finished` arrives is the
  cheapest signal that needs no server change. Its one blind spot: a page
  loaded with the job already `completed` never saw the transition, so
  `atFinish` is absent. That case deliberately falls back to the time
  window alone rather than guessing — an unobserved finish must not
  suppress a legitimately fresh checkmark.
- **Suppression triggers on any stage move, not only a forward one.** A
  put-back also means the checkmark no longer describes the lane the card
  is rendered in, so `stageAdvanced()` compares with `!==` rather than by
  phase index.

### 🌱 Follow-ups (round 2)

- **A server-side `phaseAtFinish` (or a `role` on `JobSummary`) would
  close the reload blind spot.** Either would make the signal derivable
  rather than observed, and would survive a page reload. Out of scope
  here — this change promised no server changes.
