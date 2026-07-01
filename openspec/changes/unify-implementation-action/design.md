## Context

The dashboard grew two paths to "start an agent on this change" because they
landed one at a time: Drag → Apply first (`add-ui-orchestration`), Run →
Worktree second (`add-agent-runner`). Nothing prevented the split; it just
happened. This change collapses the two into one gesture and moves the
mechanism decision to the proposal.

The proposal-time decision is the natural home for two reasons:

1. **Reusability across sessions**: once decided, the choice sticks. The
   next start (a follow-up run, a retry, a different user) doesn't have
   to re-decide.
2. **Locality of knowledge**: whoever writes the proposal knows whether
   the change is "chat with claude in my terminal" territory (small,
   interactive) or "isolate and run in parallel" territory (big,
   scale-out). The kanban gesture doesn't.

## Goals / Non-Goals

**Goals:**
- Drag TODO → IN-PROGRESS and clicking the card's start action have
  identical semantics.
- Proposals can declare `execution: worktree` or `execution: terminal`
  and skip the picker.
- Missing declaration shows a picker with a "remember" affordance.
- Legacy proposals (no `execution`) still work — they get the picker.

**Non-Goals:**
- Auto-migrating existing proposals. They stay unset and pick up the
  picker path until manually edited.
- A third execution mode (e.g. remote sandbox, Agent SDK). Two modes
  cover the current shells; adding a third is a separate change.
- Splitting the picker into multiple screens or wizards. It stays a
  single modal with two options.
- Auto-detecting execution from the assignee prefix (`@claude*` →
  worktree). Attractive but adds implicit behavior; deferred to a
  future refinement.

## Decisions

### Frontmatter schema

```yaml
execution: worktree     # spawns via agent-runner
execution: terminal     # inject /opsx:apply into embedded terminal
```

- Missing or invalid → treated as unset (picker).
- Case-insensitive parse; canonicalize to lowercase.
- Anything else → ignored with a soft warning in `parseProposal` (not
  fatal; the picker takes over).

### Client dispatch

```ts
function startImplementation(change: Change): void {
  const mode = change.proposal?.execution;
  if (mode === "worktree") return openRunFlow(change);
  if (mode === "terminal") return openApplyFlow(change);
  return openExecutionPicker(change);
}
```

- `openRunFlow` and `openApplyFlow` are the current Run and Apply
  handlers moved intact.
- `openExecutionPicker` is a new modal that, on submit, calls the
  chosen flow AND optionally persists the choice.

### Persisting the choice

- Picker offers a checkbox "Save to proposal (writes `execution:
  <mode>`)".
- When checked, the client PATCHes the proposal via a new
  `POST /api/changes/:id/proposal/execution` endpoint that:
  - Reads `proposal.md`
  - If a frontmatter block exists, inserts / replaces the `execution:`
    line inside it
  - If no frontmatter, prepends a minimal `---\nexecution: <mode>\n---\n`
  - Uses the same optimistic-lock pattern as `applyToggle` (baseHash,
    surgical edit)
- Deferred if surgical-edit for arbitrary frontmatter proves
  complicated; v1 falls back to displaying a tiny snippet the user
  copies. That fallback is called out in Non-Goals if it slips.

### UI: Start button + drag

- Rename `Run` → `Start`. Both the button label and the tooltip.
- The drag handler and click handler both call `startImplementation`.
- The `verify only` gate from `hide-run-on-verify-only` still applies:
  no Start button when only verification remains.

### Picker UX

- Modal title: "Start implementation"
- Two option cards:
  - **Terminal** — one-line summary + preview `/opsx:apply <id>` (or
    `npx openspec apply <id>` in CLI mode)
  - **Worktree** — one-line summary + preview `git worktree add
    .worktrees/<id> -b agent/<id>` and the agent command that will run
- Save-to-proposal checkbox at the bottom.
- Cancel / Start buttons.

### CommandModal reuse vs new component

- Extend `CommandModal` — the existing structure (title + preview +
  cancel + submit) fits the picker, plus one extra content slot for the
  choice cards. Keeps a single "confirm" component instead of two.

## Risks / Trade-offs

- **Behavior change for existing users.** Muscle memory says "drag =
  ask my terminal claude." After this change, drag on a proposal
  without `execution` opens the picker. Mitigation: the picker is
  fast, and the "remember" checkbox pins the previous behavior with
  one extra click.
- **Two failure modes for one gesture.** Terminal path fails if no
  terminal is open; worktree path fails if agents.yaml is empty. The
  picker cards disable the option accordingly and explain why (the
  same messaging Run and Apply already surface).
- **Frontmatter write-back requires surgical edit.** Non-trivial for
  YAML because we must preserve neighboring fields. Falling back to
  a copy-paste snippet is documented as an acceptable v1 UX; the
  full write-back is a follow-up if the copy-paste turns out to be
  a real pain point.
- **Users on smaller screens.** Two-column picker collapses to
  stacked. CSS-only concern, no behavior change.
- **Interaction with `hide-run-on-verify-only`.** The gate stays. If
  only verification remains, no Start button — regardless of
  `execution:` mode.
