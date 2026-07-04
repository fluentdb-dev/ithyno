---
tags: [feature/agents, feature/ui, screen/kanban, screen/change-detail, area/web]
---

## Why

The Kanban card shows an `AgentBadge` — currently a small
`● claude` pill on the card while an agent is attached to the
change. That badge is the only visible signal on the card that
tells the user *something is happening in an agent*, but it is
just a display element: it does not link anywhere.

To see what the agent is actually doing (the running transcript,
the elapsed time, the diff, the finish status) the user has to:

1. Notice the agent is running.
2. Open the sidebar.
3. Navigate to `/agents`.
4. Scan the job list for the change id, match against a spawn
   time, and click into the correct row.

That's four gestures and one visual grep between "I see it's
running" and "I see what it's doing." Meanwhile the `AgentBadge`
is right there on the card, already scoped to the correct job,
already visually tied to the change.

`ChangeDetail` has the same asymmetry: it renders a `worktree ·
switch to worktree view` link and the same progress bar as the
Kanban card, but no direct affordance to jump into the running
agent's transcript.

## What Changes

### AgentBadge becomes a Link

- In `web/src/components/Kanban.tsx::AgentBadge`, wrap the badge
  content in a `<Link>` to `/agents?job=<jobId>&tab=output`
  whenever `job` is defined (any state — running, completed,
  crashed, cancelled, orphaned). No badge when no job (nothing to
  link to).
- Preserve the existing pulse animation for the running state.
- Add a subtle hover cue (`text-decoration: underline` on hover
  or a chevron `→` shown on hover) so the affordance reads as
  clickable, not decorative.
- The click SHALL NOT trigger any parent card handler
  (`stopPropagation` on the link click) — the card itself is
  already navigable to `/change/<id>` and we don't want to race.

### ChangeDetail: header agent link

- In `web/src/pages/ChangeDetail.tsx`, next to the existing
  progress bar / `worktree · switch to worktree view` link,
  render a "View agent" link that goes to `/agents?job=<jobId>
  &tab=output`.
- Gate on the same predicate the Kanban card uses (`!!job`).
- Link icon or label: `● claude · view agent` (matches the badge
  styling so users recognise it as the same affordance).

### URL parameter contract

- The existing `/agents` page already reads `?job=<id>&tab=…`
  URL params (see `add-worktree-change-view`'s pattern and the
  `focusedJobId` / `focusedTab` state in `Agents.tsx`).
- No new server-side plumbing; this is purely a client-side
  navigation change.

## Capabilities

### Modified Capabilities

- `dashboard`: the Kanban card's `AgentBadge` and ChangeDetail's
  header both link to `/agents?job=<jobId>&tab=output`, giving
  users a one-click path from "there's an agent" to "here is
  what it is doing."

## Impact

- `web/src/components/Kanban.tsx::AgentBadge` — wrap in `<Link>`,
  add hover styling, stop-propagation on click
- `web/src/pages/ChangeDetail.tsx` — new "View agent" link in the
  header next to the progress bar
- `web/src/styles.css` — hover cue for the badge-as-link

## Out of scope

- **Elapsed-time timer on the Kanban card / ChangeDetail.** Would
  further improve the "something is happening" signal, but is a
  separate visual + tick-loop concern. Deferred to a follow-up.
- **Inline output preview on the Kanban card** (e.g. showing the
  last N stdout lines under the card). Substantial layout change;
  separate proposal if desired.
- **Runner lifecycle narration lines** (`[worktree] creating
  …`, `[spawn] claude …`) in the Agents transcript. Complementary
  UX improvement; separate proposal already discussed but not yet
  landed.
- **Making the whole card a link.** Card already routes to
  `/change/<id>` on click (existing behavior). Retaining that as
  the "primary" click behavior and using the badge as the
  specialised agent-view escape hatch preserves the current
  primary flow.
