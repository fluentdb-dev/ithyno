## Context

Parallel-agent execution is the recurring theme of this project. The plumbing
lets multiple changes run at once (each in its own worktree), and the
`bucketize` logic already flips a card to IN-PROGRESS the moment a job
spawns. What's missing is a **launch surface that lives where parallel
work is watched from** — the IN-PROGRESS column header.

The `+ New Change` button in the TODO header already established this
"column-scoped action" pattern in `add-kanban-view`. We reuse it verbatim
so the muscle memory transfers.

## Goals / Non-Goals

**Goals:**
- One-click access to a parallel Start from the IN-PROGRESS column
- Restricts candidates to changes that are actually ready to run
- Reuses the shared `useStartFlow()` so the picker / worktree / terminal
  branches behave identically to the card-level Start
- Zero server-side changes

**Non-Goals:**
- Batch-start (multi-select in one click)
- Job queueing or concurrency limits
- Cross-change dependency awareness
- DONE-column Start / re-run

## Decisions

### Placement: header, right-aligned, mirrors TODO's `+ New Change`

The Column component already renders `header.kanban-col-head` with
`h3` + count on the left and an optional action button on the right. We
generalize the current `onAdd` prop to `onAdd?: { label, onClick, disabled?, title? }`
or add a sibling `onLaunchStart?` prop. Either way the visual template is
the same.

Preference: **add a sibling `onLaunchStart` prop** so the launcher
button can render with its own semantic (icon + count-badge) without
overloading the "+ New Change" affordance.

### Label wording

`Start ▾` — the caret hints at a dropdown. A count badge `Start ▾ (3)`
optionally shows how many candidates are available so the user knows before
clicking whether the launcher is worth opening.

Rejected: `+ Start` — the `+` reads as "create," which Start is not.
Rejected: `Run ▾` — inconsistent with the Start rename that
`unify-implementation-action` landed.

### Popover vs. modal

**Popover anchored to the button.** Modal would over-block the user (the
IN-PROGRESS column is where they are watching progress). Popover keeps the
column visible.

A backdrop click / Esc closes it. Popover width caps ~320 px so it doesn't
overlap the DONE column on narrow viewports.

### "Startable" filter

Reuses `hasNonVerifyWork` from `web/src/util/changeState.ts` (already the
canonical predicate on tasks-remaining). Adds a job check:

```
startable(change, jobByChange) =
  agents.length > 0 &&
  change.progress not all done &&
  hasNonVerifyWork(change.tasks) &&
  !isRunningOrPending(jobByChange.get(change.id))
```

Candidates come from `changes` unfiltered (across TODO + IN-PROGRESS — an
IN-PROGRESS change with a completed job but partial tasks is startable
again for continuation).

### Interaction with the ExecutionPicker

Picking a candidate does **not** bypass the picker. It calls
`startImplementation(change)` which reads `proposal.execution` and either
dispatches directly (worktree/terminal) or opens the picker. Parity with
the card-level Start.

### Empty state

`Start ▾` disabled with tooltip explaining why. Reason strings:

- 0 agents in agents.yaml → `"No agents in agents.yaml."`
- All changes are running / verify-only → `"Nothing startable — all
  changes are already running or have verify-only work left."`

## Alternatives considered

- **Global toolbar Start** at the top of the page (like a FAB). Rejected:
  loses the column-context — parallel work is a per-column concept.
- **Multi-select checkbox on each card**. Rejected for v1: adds mode
  complexity and dashboard is fluent single-select today.
- **Auto-launch next-in-queue when a job finishes**. Rejected: implicit
  behavior, hard to reason about. Explicit picks stay in the user's hands.
- **Reuse the ExecutionPicker as the candidate list**. Rejected: the
  ExecutionPicker is *per-change* (Terminal vs. Worktree). The launcher
  is *cross-change* (which change to start). Different axes.

## Risks

- **Runaway parallelism**: user clicks 10 candidates, spawns 10 Claude
  sessions, machine grinds. Mitigated by keeping opens explicit (no
  batch-select) and by the count badge showing candidate count. If a
  concurrency limit becomes necessary later, add it in agent-runner, not
  in the launcher UI.
- **Popover position on narrow viewports**: if the DONE column is
  vertically close, popover may clip. Handle with viewport-aware
  placement (`right: 0` fallback).
