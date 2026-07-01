---
tags: [feature/kanban, feature/agent-runner, feature/ui-orchestration, area/web, area/server]
---

## Why

The dashboard ended up with **two similar-looking actions** for the same
intent — start implementation:

- **Drag TODO → IN-PROGRESS** injects `/opsx:apply <id>` into the
  embedded terminal (main working tree, existing claude session).
- **Run button** spawns an agent in `.worktrees/<id>/` via
  `child_process.spawn` (isolated, parallelizable).

They share the same goal but branch on runtime mechanism, which the user
has to reason about at action time. That is the wrong moment. The
mechanism is a **planning decision**: it belongs to the proposal, not the
button click.

This change unifies the action semantics. Drag = click = "start
implementation." The execution mechanism (terminal vs worktree) is read
from the proposal's frontmatter, and a picker appears only when the
proposal doesn't say. See the updated
[task-assignment idea](../../../docs/ideas/2026-06-24-task-assignment.md#update-2026-07-01-unified-action--execution-mode-in-proposal-frontmatter).

## What Changes

### `execution` field on proposal frontmatter

```yaml
---
tags: [...]
execution: worktree     # or: terminal
---
```

- `worktree` — the existing agent-runner spawn path
- `terminal` — the existing `/opsx:apply` inject path
- Unset — the UI shows a picker

### Unified action semantics

- Drag TODO → IN-PROGRESS and clicking the card's start action share one
  handler.
- Handler reads `change.proposal.execution`; dispatches directly when set;
  otherwise opens the picker.
- The Run button label becomes **Start** to reflect the unified meaning
  and avoid implying "always spawn."

### Picker with optional "remember"

- Modal offers two choices — Terminal or Worktree — with a short
  description of each and the exact command/spawn that will run.
- Optional **"Save to proposal"** checkbox writes the selected value into
  the proposal's frontmatter via the existing surgical-edit machinery, so
  subsequent starts skip the picker.

### CLI mode interaction (unchanged rule, clearly scoped)

- Terminal execution respects the existing Claude / CLI toggle. CLI +
  terminal disables the action (same as today's Drag with CLI mode).
- Worktree execution ignores the toggle — the spawn command comes from
  `agents.yaml`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `dashboard`: kanban card start action is unified; the Run button is
  renamed Start; drag TODO → IN-PROGRESS is aliased to the same handler
- `ui-orchestration`: the CommandModal presents an execution picker when
  the proposal has no `execution` field, and the worktree preview shows
  the git commands the server will run
- `openspec-parsing`: the proposal parser reads the optional `execution`
  field and mirrors it on `ProposalDoc`

## Impact

- `server/parser/proposal.ts`: extract `execution` from frontmatter
- `server/model.ts` and `web/src/types.ts`: `ProposalDoc.execution?: "worktree" | "terminal"`
- `web/src/components/Kanban.tsx`: new `startImplementation(change)` shared by drag and click; rename Run → Start
- `web/src/components/CommandModal.tsx` (or a new small ExecutionPicker component): picker UI with Save-to-proposal
- Optional server surgical-edit for writing `execution` back into
  frontmatter (skipped for v1 if it complicates surgical-edit; UI hint
  points at manual edit as fallback)
- No new dependencies
