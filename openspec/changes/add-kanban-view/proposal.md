---
tags: [feature/kanban, screen/overview, area/web]
---

## Why

The Overview today is a flat grid of change cards plus an Archive accordion.
That representation hides the project's natural shape: the OpenSpec workflow
itself has three observable states, and the user's mental model is that
lifecycle, not "active vs archived." A Kanban view that maps directly to
`/opsx:propose → /opsx:apply → /opsx:archive` makes "what's next, what's
moving, what's done" obvious at a glance, and turns the dashboard from a
status display into a workflow-driven board.

The kanban also provides a natural surface for future assignment
([task-assignment](../../../docs/ideas/2026-06-24-task-assignment.md)). v1
intentionally excludes assignment so this change stays focused; the design
notes the integration points so they slot in cleanly later.

## What Changes

Replace the Overview's card grid + Archive accordion with a **Kanban board**:

- **Three columns** mapped to OpenSpec workflow states, derived from
  observable progress:
  - **TODO** — active change with `0/N` tasks complete
  - **IN-PROGRESS** — active change with `0 < done < total`
  - **DONE** — `done == total` (awaiting archive) and archived changes,
    grouped together with the archived ones rendered as a recent list with a
    "Show all" expansion.
- **Drag-to-transition** as gesture invocation of the workflow commands:
  - TODO → IN-PROGRESS: inject `/opsx:apply <id>` into the active terminal.
  - DONE (ready group) → DONE (archived): inject `/opsx:archive <id>`,
    blocked if `outcome.md` is missing (with a hint to write it first).
  - Backward and skip-ahead drags are disabled.
- **Reuse existing infrastructure**: the inject endpoint from
  `add-ui-orchestration`, the command-style selector from
  `add-cli-command-mode` (so CLI users get `npx openspec apply` instead),
  the outcome detection from `add-archive-outcome`.

The "+ New Change" affordance moves from the summary line to the TODO column
header, keeping it near the column it lands in.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `dashboard`: the Overview is now a workflow-driven Kanban board (TODO /
  IN-PROGRESS / DONE), drag gestures invoke the OpenSpec workflow commands,
  and the Archive accordion is folded into the DONE column

## Impact

- New `web/src/components/Kanban.tsx` (board + column components)
- Refactor of `web/src/pages/Overview.tsx` to host the board
- New dependency: `@dnd-kit/core` (drag and drop)
- Reuses: `injectPty` (add-ui-orchestration), `commandStyle` store
  (add-cli-command-mode), `archive.outcome` (add-archive-outcome)
- No server changes
- The existing per-task Tasks view inside ChangeDetail is unaffected
