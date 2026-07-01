## Context

`openspec archive <id>` (and `/opsx:archive <id>`) moves the change folder from
`openspec/changes/<id>/` to `openspec/changes/archive/<YYYY-MM-DD>-<id>/` and
merges delta specs into `openspec/specs/`. The watcher reports the move; the
dashboard re-fetches `/api/state`; the id is now in `state.archive` (summary
only — `id` and `progress`), not `state.changes`. The Change Detail page does a
`state.changes.find` and returns null, falling through to a generic
"Change not found" message that was written for typo'd URLs.

## Goals / Non-Goals

**Goals:**
- A clear, intentional "Archived" panel when the user lands on a change id that
  exists in the archive.
- Show the archive date and the final task progress (e.g. "16/16 tasks
  complete").
- A prominent "← Back to Overview" link.
- Preserve the existing "not found" message for ids that are neither active nor
  archived (typos, deleted-by-hand directories).

**Non-Goals:**
- A full archive viewer that re-renders proposal/design/specs/tasks from the
  archived change directory. That is a worthwhile follow-up but out of scope
  here.
- Auto-redirect away from `/change/<id>`. The friendly screen *is* the
  feature; redirecting away would lose the context that the user just archived
  this change.
- Restoring archived changes back to active.

## Decisions

- **Detection logic.** `ChangeDetail` first looks in `state.changes` (current
  behavior). If null, look up `state.archive` by id; if found, render the
  archived panel. If neither, fall back to the existing "not found" message.
- **Archive date in the summary, not parsed client-side.** Extend
  `ChangeSummary` with `archivedAt: string | null` (YYYY-MM-DD) on the server.
  The server already iterates archive directories during scan and knows the
  directory names, so parsing the date prefix there avoids duplicating logic.
- **Pattern.** Match `^(\d{4}-\d{2}-\d{2})-(.+)$` against the archive directory
  name. The first group is `archivedAt`, the second is the change `id`. If the
  pattern does not match (e.g. a hand-renamed folder), the directory name *is*
  the `id` and `archivedAt` is `null`. The UI shows "Archived" without a date
  in that case.
- **No new URL.** Render at the existing `/change/<id>` URL. A future archive
  viewer can introduce `/archive/<id>` without conflict.
- **Live transition feel.** When a user archives the change they are currently
  viewing, the page snaps from active → archived state on the next state push.
  v1 does not animate the transition — the panel swap is clear enough on its
  own.

## Risks / Trade-offs

- **Stale bookmarks.** Anyone with a bookmark to a since-archived change will
  land on the new screen. That is the intended improvement; mitigation is the
  prominent Back to Overview link.
- **Directory naming assumption.** We assume the `<YYYY-MM-DD>-<id>` prefix
  emitted by the CLI. Hand-renamed folders gracefully degrade to "Archived"
  without a date — no crash.
- **Duplicate ids.** If somehow both `state.changes` and `state.archive`
  contain the same id (broken state), the active list wins (current behavior is
  preserved).
