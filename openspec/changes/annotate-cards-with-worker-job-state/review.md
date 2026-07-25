---
verdict: pass
summary: "Verify stage: test / typecheck / build all green. Only failure is the pre-existing build-icons sharp issue."
findings: []
---

## Verify results (Manager fallback — no `verify` agent declared in agents.yaml)

| Gate | Result |
|---|---|
| `npm test` | 551 passed, 1 skipped, **1 failed** — `scripts/build-icons.test.mjs` only |
| `npm run typecheck` | clean |
| `npm run build` | clean (11.00s) |

The single failure is `scripts/build-icons.test.mjs > second run of
build:icons produces byte-identical output` — the known `sharp` /
Node 25.8 module-resolution failure on this machine. Pre-existing on
`develop` and independently reported by all three concurrent code
workers. Not attributable to this change.

## Stage history

**Round 1 — review: `needs-rework`** (one `severity: high` finding)

> `WorkerStateIndicator.tsx:77` — "The `completed` branch only looks at
> `job.status`/`finishedAt`, so a card can keep showing `done` for up to
> 30 seconds even after the change has already advanced to its next
> phase."

The Manager accepted this. Root cause was an inconsistency in the
change's own artifacts: `proposal.md` specified a phase-aware hide rule
(*"`completed` (and change.phase advanced) → not shown"*) that
`specs/dashboard/spec.md` — the normative artifact — did not encode,
stating only the 30-second window. Round 1 implemented the spec. Both
artifacts were authored by the Manager and disagreed.

Adjudication: implement the phase-aware rule **and** tighten the spec to
match, on the grounds that a lingering "done ✓" on a card that has
already moved lanes misreports the card's current state — the exact
failure this change exists to prevent.

**Round 2 — review: `pass`**, no findings.

> "The rework is correct: `setJobFinished()` snapshots the change's
> stage into `jobStageAtFinish`, `laneForPhase()` centralizes the same
> lane resolution used by both phase bucketing and the indicator, and
> `stageAdvanced()` suppresses `completed` as soon as the card has left
> the stage the worker finished in. The documented blind spot is handled
> sanely."

## Accepted deviation (do not re-open)

Tasks 1.2/1.3 — evicting finished jobs from `jobByChange` after 30 s —
were deliberately **not** implemented. That map also gates Merge / View
diff / Discard and `perCardStartEligible`; evicting would drop the Merge
affordance and resurrect Start on a change with an unmerged worktree.
Transience is enforced at render time instead. The spec's retention
wording was corrected in round 2 so it no longer implies eviction.

## Known limitation carried forward

The stage a finished job belonged to is **not derivable** from the data
model: `JobSummary` carries no dispatch role (only `agentName`, which is
ambiguous for multi-role agents) and phases carry no timestamp. Round 2
works around this by observing the stage at finish time.

Consequence: a page loaded when the job is *already* `completed` never
observed the transition, so no snapshot exists and the time window alone
applies. This is deliberate — guessing could suppress a legitimately
fresh checkmark. A server-side `phaseAtFinish`, or a `role` field on
`JobSummary`, would close it properly. Recorded as a follow-up in
`outcome.md`.

## Carried forward (non-blocking, for the human before archive)

- `tasks.md` 7.5 / 7.6 / 7.7 — manual checks requiring a live dispatch
  and a deliberate SIGKILL to observe crashed/orphaned states.
