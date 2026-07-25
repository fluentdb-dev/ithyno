---
verdict: needs-rework
summary: "The shared card indicator landed, but completed jobs still render a transient 'done' state after the change has already advanced phases."
findings:
  - severity: high
    file: web/src/components/WorkerStateIndicator.tsx
    line: 77
    message: "The `completed` branch only looks at `job.status/finishedAt`, so a card can keep showing `done` for up to 30 seconds even after the change has already advanced to its next phase. The proposal explicitly requires completed indicators to disappear once the phase has advanced; pass the change's current phase (or an equivalent stage signal) into the indicator and suppress the completed state when it no longer belongs to the card's current lane."
---

## Notes

Intent: extend the shared `KanbanCard` so both Board and Phase views show worker-state annotations (running, queued, done, and failure states) from the existing job registry, including elapsed time and a short just-finished state.

The diff covers the new indicator component, formatter, styling, and branch-table tests, but it does not implement the proposal's phase-aware hide rule for completed jobs.
