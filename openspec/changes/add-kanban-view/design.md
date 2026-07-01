## Context

The dashboard ships three building blocks that this change composes into a
board:

- `/api/state` already returns active changes (with `progress`) and the
  archive list (with `archivedAt` and `outcome`).
- `injectPty` (`add-ui-orchestration`) writes commands into the active
  terminal where Claude Code or the user's shell executes them.
- `commandStyle` (`add-cli-command-mode`) picks between `/opsx:*` and
  `npx openspec ...`.

What's missing is the visual + gesture layer that turns that data and those
endpoints into a workflow board. There are no new server contracts. The
column derivation and drag handling live entirely in the UI.

## Goals / Non-Goals

**Goals:**
- Three columns whose membership is computed purely from observable state
  (no new fields, no extra metadata).
- Drag gestures that translate to OpenSpec workflow commands via the existing
  inject endpoint.
- DONE column unifies "ready to archive" and "archived" so the workflow
  finish line lives in one place.
- The board is the Overview — no toggle to "go back" to the old card grid in
  v1.

**Non-Goals:**
- Assignment (`@claude`, `@user`). See
  [task-assignment idea](../../../docs/ideas/2026-06-24-task-assignment.md);
  comes in a follow-up change.
- Per-task Kanban inside a change. The earlier interpretation of this change
  is abandoned; the task checkbox tree on ChangeDetail stays as-is.
- Persisting column order, custom columns, or kanban customization.
- Backward transitions ("undrag" from DONE to TODO). Workflow is monotonic;
  reversion happens in the terminal if necessary.
- A layout switcher to show the old card grid. Single layout in v1; can be
  added later if anyone misses the cards.

## Decisions

- **Columns are derived, not stored.** Each render:
  - `changes.filter(c => c.progress.done === 0)` → TODO
  - `changes.filter(c => c.progress.done > 0 && c.progress.done < c.progress.total)` → IN-PROGRESS
  - `changes.filter(c => c.progress.done === c.progress.total && c.progress.total > 0)` → DONE (ready group)
  - `archive` → DONE (archived group)
  - Edge case: `total === 0` (no tasks.md or empty checklist) → TODO column.
- **DONE column layout.** Two visual sub-sections inside the column:
  - "Ready (awaiting archive)" — cards drawn with the active-change styling,
    plus a green dot indicating completion.
  - "Archived" — compact rows with the archive date, recent N (default 8)
    visible, "Show all" expands the rest.
- **Drag mechanics with `@dnd-kit/core`.**
  - Sources: only TODO cards and DONE-ready cards are draggable.
  - Allowed drops: TODO → IN-PROGRESS, DONE-ready → DONE-archived.
  - Hover feedback: highlight the legal drop column; show "blocked" cursor
    on illegal targets.
  - On drop, run the same flow as the Apply / Archive buttons from
    `add-ui-orchestration`: open a `CommandModal` with the literal command
    pre-filled, the user confirms, the command is injected. Drag is a
    shortcut to that modal, not a silent execution.
- **Archive guard: outcome.md must exist.** Before opening the archive
  modal, check `change.proposal` exists (i.e. an active change with all
  tasks done). If the active change has no `outcome.md` next to its other
  artifacts, surface a one-line warning in the modal ("No outcome.md yet —
  write one before archiving") with a dismissible Send button. We do not
  block; the discipline is social, not enforced.
- **+ New Change moves to the TODO column header.** Stays primary action,
  visually anchors to where the new card will appear.
- **Command-style awareness.** The drag handler reads `commandStyle` from
  the store and produces the appropriate command form. Apply has no CLI
  equivalent (per `add-cli-command-mode`), so dragging TODO → IN-PROGRESS
  in CLI mode opens the modal disabled with the same tooltip the Apply
  button uses.
- **Outcome detection.** Active changes don't carry an outcome field in
  `/api/state` today (only archive entries do). For the v1 guard we look
  at the change's directory layout client-side by checking if an
  `outcome.md` file is referenced — but the cleaner path is a tiny server
  addition: extend `Change` with `hasOutcome: boolean`. We take the small
  server addition as part of this change so the UI guard is reliable.

## Risks / Trade-offs

- **DONE column gets long.** Archived list grows over the lifetime of a
  project. Mitigation: pagination via "Show all", recent-first sort. A
  future change could filter by tag/date.
- **Drag adds bundle size.** `@dnd-kit/core` is ~30 KB gzipped — acceptable
  for the core UX. Lazy load remains an option later.
- **Dragging without an open terminal.** Same failure mode as the Apply /
  Archive buttons; the existing 409 "no terminal open" path surfaces a
  toast pointing the user to open a ChangeDetail (or in a future change, a
  global terminal toggle).
- **Single-layout v1.** Some users may want the old card grid back. We are
  explicit that this is by design; readding cards as an alt layout is a
  separate, easy change if demand appears.
- **Assignment hooks deferred.** The card component should leave a clearly
  marked slot for the assignee badge so when
  `add-{agent,user}-assignment` lands it drops in without churn. v1 design
  reserves the JSX position; the slot is empty.
