---
tags: [feature/kanban, feature/agent-runner, area/web]
---

## Why

The Kanban card shows a Run button on any TODO or IN-PROGRESS change. That is
right when there is code/docs/tests left to write, but **wrong when the only
remaining work is human verification** — a checklist like "open the browser
and click X." Running an agent in that state at best wastes a worktree, and
at worst lets the agent self-report verifications it cannot actually do.

The user observed this on `add-csrf-protection` (23/30): everything in tier
8 is "docs" and everything in tier 9 is "verify"; the agent could pick up
the former but not the latter, yet the UI offers Run as if both were fair
game.

## What Changes

Hide the Run action on a Kanban card when **all unchecked tasks live under
a section whose title contains "verif" (case-insensitive)**. Examples that
match: `## 9. Verification`, `## 10. Verification (manual)`. Examples that
don't match: `## 8. Docs`, `## 7. Style`.

If even one unchecked task is in a non-verify section, Run still appears —
the agent can pick up that task and leave the verify ones for the human.

In place of the Run button, the card shows a small muted hint
"verify only" so the user knows why Run is missing and which kind of work
remains.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `dashboard`: the Run button on Kanban cards is suppressed when all
  remaining tasks belong to verification-titled sections

## Impact

- `web/src/components/Kanban.tsx`: derive `hasNonVerifyWork(change)` from
  the existing parsed task sections; gate the Run button on it
- A small "verify only" hint replaces the Run button when suppressed
- No server changes (sections are already in the change payload)
- CSS for the muted hint
