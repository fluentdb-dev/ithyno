## Context

The Kanban card's progress bar shows live worktree progress via the
`worktreeProgress` slice. That's a number. The ChangeDetail's Tasks tab
shows checkbox state — that's content, and it comes from the main-tree
`openspec/changes/<id>/tasks.md`, which the agent doesn't touch. The
mismatch is the user's complaint: card says "18/33", detail page says
"7/33 unchecked… but wait, all these boxes are empty."

The fix is to let the ChangeDetail view be sourced from the worktree
when there is one. Two structural options:

1. **Automatic switch based on job status.** When a running/pending
   job exists for this change, always show worktree content.
2. **URL-driven switch.** `?tree=worktree` is the switch. Kanban card
   links carry it when appropriate.

We pick (2), because:

- The URL is shareable and reflects intent (a user can bookmark
  "worktree state of this change" during review).
- Comparing worktree vs. main tree pre-merge is a legitimate use case;
  automatic-switch takes that away.
- Predictable: same URL always shows the same view. No time-dependent
  rendering (which the automatic path would be).

## Goals / Non-Goals

**Goals:**
- Serve the worktree version of a change from a single new query param.
- Route it in from the URL; Kanban card links carry the param when a
  worktree exists.
- Fall back cleanly (server 404, or user navigates to a change without
  a worktree) — the plain URL always works.
- Zero new endpoints; extension of the existing `GET /api/changes/:id`.

**Non-Goals:**
- Editing worktree tasks.md via the dashboard's toggle path.
- Live WS updates of the worktree content beyond the existing
  `worktreeProgress` slice.
- A "diff" view between main tree and worktree change.
- Persisting last-viewed tree across navigation.

## Decisions

### Query param name: `tree=worktree`

Considered `?view=worktree` — rejected. "View" is overloaded (Overview,
tab views, etc.). "Tree" matches the actual switch: which openspec
tree are we reading? Extensible if we later add `tree=main` (explicit)
or `tree=<branch-name>` (compare arbitrary branches).

### Server parse from `.worktrees/<id>/openspec/`

The server keeps `parseChange(openspecDir, id)` untouched. It just
resolves a different `openspecDir` when the query param is present:

```ts
const worktreeOpenspec = join(PROJECT_ROOT, ".worktrees", id, "openspec");
```

If that path is missing (`existsSync` false), we return 404 with a
JSON body:

```json
{ "error": "no worktree at .worktrees/<id>. The plain URL /change/<id> shows the main-tree view." }
```

The client turns 404 into a fallback to the store's main-tree change,
so navigation stays fluid.

### Client fetch on URL change

`useSearchParams()` reads the switch. When it changes (including on
mount), an effect fetches `/api/changes/:id?tree=worktree`. The store
is not modified — the worktree change is component-local state, so a
`?tree=worktree` view for one change doesn't taint other consumers of
the store's `changes` slice.

### Kanban card link decision

Same helper the badge uses: **worktree link when the change has an
active worktree**. Defined as `hasActiveWorktree(change, job)`:

- job exists AND
- job.status is `running` OR job is in "pending merge/discard" state
  (per the existing `isPendingMergeOrDiscard` check).

Cards for cancelled / not-yet-started / already-merged changes link to
the plain `/change/:id`.

### "Switch to main" affordance

A pill in `ChangeDetail`'s head — reads "viewing worktree" and links to
`/change/<id>` without the param. On the main-tree view, the pill is
absent (no toggle back-and-forth needed; the Kanban card link brings
you in with the right URL).

### Fallback on 404

If the worktree got Discarded (or the fetch fails for any reason), we
transparently fall back to the store's main-tree change and show a
non-blocking notice: "worktree gone — showing main tree." No forced
redirect (URL stays `?tree=worktree`) so a page-refresh retries.

## Alternatives considered

- **Automatic switch on active job.** Rejected — the URL becomes a lie
  ("this URL shows one thing today, something else tomorrow").
- **Separate route `/change/:id/worktree`.** More typing to write and
  gets us nothing over a query param.
- **Broadcast full worktree change over WS.** More engineering than
  needed; the user only opens ChangeDetail when they want to look
  closely, and a single fetch on navigation is fine.
- **Return both trees in one payload and switch client-side.** Doubles
  the response size and complicates the parser call. Keep it as two
  fetches with a clean 404.

## Risks

- **404 on Discard race.** If the user clicks the card at the exact
  moment Discard fires, they land on `?tree=worktree` and immediately
  get 404. Handled by the fallback + notice path.
- **Diverged worktree layout.** If the worktree's `openspec/changes/<id>/`
  has a different set of files than the main tree (e.g., agent removed a
  file), `parseChange` handles missing files gracefully today (returns
  partial). No new failure mode.
- **Confusion about what URL is showing.** Mitigated by the head pill
  ("viewing worktree · switch to main").
