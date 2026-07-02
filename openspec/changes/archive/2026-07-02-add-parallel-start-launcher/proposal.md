---
tags: [feature/kanban, feature/agent-runner, area/web]
---

## Why

The dashboard's long-term goal is **UI-driven parallel agent execution in
isolated git worktrees**. Today the plumbing supports it — each change runs
in its own `.worktrees/<change-id>/` on `agent/<change-id>` — but the UI
doesn't invite it. Starting parallel work requires:

1. Scroll the TODO column to find a card
2. Click its Start button
3. If several parallel jobs are wanted, repeat 1–2 for each one

Meanwhile the IN-PROGRESS column already shows what's running. That's the
column the user is looking at while they think "let me start another one
alongside this." A **column-header Start launcher** — mirroring the
`+ New Change` button that already lives in the TODO header — makes the
gesture native to the parallel-dogfood workflow.

## What Changes

- **IN-PROGRESS column header** gains a **`Start ▾`** button on the right,
  next to the count. The pattern matches TODO's `+ New Change` visually
  (same button style + placement).
- **Click → dropdown / small popover** listing every change that is
  **startable but not currently running**. "Startable" means:
  - No active worktree job for the change
  - Has non-verify implementation work remaining (`hasNonVerifyWork`)
  - Not in DONE (progress incomplete)
- **Pick a change** → the same shared `useStartFlow().startImplementation`
  is invoked; the card jumps to IN-PROGRESS (existing bucketize behavior)
  and its job status renders alongside the running peers.
- **Zero candidates** → the button is disabled with tooltip
  `"Nothing startable — all TODO changes are already running or have
  verify-only work left."`
- The **existing card-level Start** on each TODO/IN-PROGRESS card is
  **unchanged**. The launcher is an additional entry point, not a
  replacement.

## Capabilities

### New Capabilities
<!-- none — this is UI wiring against existing capabilities -->

### Modified Capabilities
- `dashboard`: IN-PROGRESS column header gains a Start launcher; the Kanban
  becomes discoverable for parallel execution

## Impact

- `web/src/components/Kanban.tsx`:
  - `Column` accepts an optional `renderHeaderAction` (or specific
    `onLaunchStart` prop) for the IN-PROGRESS variant
  - New small popover component `<ParallelStartLauncher>` renders the
    candidate list and dispatches through `startImplementation`
  - "Startable" filter reuses `hasNonVerifyWork` from
    `web/src/util/changeState.ts`; no new helper
- `web/src/styles.css`: matching styles for the header button + popover
- No server-side changes — the agent-runner already permits parallel
  spawns (one lock per change-id, not global)
- No auth / gate changes — Start dispatch uses the same
  `useStartFlow` flow which already goes through Origin + session token

## Out of scope

- **Queueing** or **rate-limiting** parallel jobs. If the user picks 10
  changes, 10 agents spawn. Machine load is user's concern for v1.
- **Cross-change dependency tracking**. The launcher does not know which
  changes depend on which; picking them is manual.
- **DONE-column Start** (e.g. re-run against a completed change). Out of
  scope; those are archive candidates, not implementation targets.
- **Multi-select** in one click. v1 = one pick per opening the popover.
  If the user wants three, they open it three times.
