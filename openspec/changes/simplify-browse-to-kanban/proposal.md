---
tags: [dashboard, browse, kanban, ux, simplify]
execution: worktree
---

## Why

The archived `unify-open-project-3-branch` shipped a "Browse read-only"
button on `NoProjectDecisionPanel` that mounts a dedicated
`ReadOnlyBrowse` component — a two-pane markdown-tree browser fetching
via `/api/browse/markdown-tree` + `/api/browse/markdown`.

Actual user testing (2026-07-24) surfaced that this is the wrong UX:

- On a non-openspec folder, the folder often has no `docs/` and only a
  README/CLAUDE.md at root, so the tree is nearly empty; the two-pane
  markdown viewer is overkill.
- Users hitting Browse read-only expect the **normal openspec dashboard
  view (topbar + Kanban)** — even if the Kanban is empty because
  openspec/ doesn't exist yet — because it matches the mental model of
  "look around the project" more than a doc reader would.
- The dedicated Browse endpoints, the tree walker, the ReadOnlyBrowse
  component, and its styling are all maintenance cost that add
  no value now that Import (via Electron menu / VS Code command)
  handles the "explore a repo before initializing" use case.

## What Changes

- **`web/src/App.tsx`**: remove the `if (browseMode && !authExpired) return <ReadOnlyBrowse />` branch. The `browseMode` store field stays as a client-side flag, but its rendering effect changes:
  - When `browseMode === true` AND `state?.exists === false`, the app SHALL render the normal chrome (topbar + Routes) as if the openspec project existed. The empty-state `NoProjectDecisionPanel` gate is skipped so the user lands on the Overview page.
  - Overview (Kanban) renders with zero changes; the existing "no changes" empty-state copy already covers this.
- **`web/src/components/ReadOnlyBrowse.tsx`**: kept but no longer wired. Marked for removal in a follow-up cleanup change (or removed here — decide during implementation based on whether the sidebar is reusable for future features).
- **`server/browse.ts` + `/api/browse/markdown-tree` + `/api/browse/markdown`**: kept for now; they're a small, generic capability that might be reused. Add a note that no client currently consumes them.
- **`NoProjectDecisionPanel.tsx`** copy: change "Browse read-only" button label to something more accurate for the new behavior (e.g. `Open as-is` or `View dashboard anyway`).
- **Spec update**: `unify-open-project-3-branch`'s "Browse read-only mode" requirement is MODIFIED to reflect the new behavior. Scenarios that referenced the two-pane markdown tree are dropped.

## Success

- User opens a non-openspec folder → NoProjectDecisionPanel shows Initialize + Browse.
- Clicking Browse → app immediately transitions to the normal openspec dashboard: topbar + Overview (empty Kanban) + Terminal (if agents.yaml).
- No dispatch, Start, or mutating action is available because there are no changes to act on.
- User can navigate to Specs / Archive / Docs / Settings tabs — all are read-only-ish naturally (no changes to modify).
- Re-clicking a hypothetical "Back to decision" affordance clears browseMode → panel reappears. (This affordance is optional; if omitted, only a page reload returns to the panel.)

## Non-goals

- This change does NOT delete `ReadOnlyBrowse.tsx` or the `/api/browse/*` endpoints. Those are inert but preserved for now. A follow-up cleanup can remove them once we're confident no future feature needs them.
- This change does NOT introduce read-only enforcement on the mutating endpoints (dispatch, Start). Since there are no changes in an empty openspec, the mutating paths are naturally inaccessible from the UI. Server-side enforcement is out of scope.
- This change does NOT touch the Import flow.
