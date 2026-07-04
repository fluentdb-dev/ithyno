---
tags: [feature/worktree, feature/tasks, area/server, area/web]
---

## Why

`add-worktree-change-view` added the `?tree=worktree` URL param so users
can inspect the worktree's `tasks.md` while an agent is running. But it
is **read-only** — clicking a checkbox in the worktree view returns
`400 invalid filePath` because `server/index.ts::withinOpenspec()`
only accepts paths inside the main `openspec/` directory. Worktree
paths under `<projectRoot>/.worktrees/<id>/openspec/` are rejected.

The `tighten-archive-verify-in-worktree` change makes verify-in-worktree
the natural pre-merge gate: the user ticks verify items in the
worktree's `tasks.md` before the archive skill advances. That
requires being able to tick worktree tasks from the UI. Today they
cannot; the flow is blocked.

The related UX gap: on the main view, we show a passive `worktree`
badge next to the progress bar when a job with worktree progress
exists. It is a dead label — no click affordance. Meanwhile the
worktree view has a `viewing worktree · switch to main` pill that IS
a Link. The switching is asymmetric.

## What Changes

### Server: allow toggle writes under `.worktrees/*/openspec/`

- **Extend `withinOpenspec()`** (in `server/index.ts`) so that in
  addition to paths inside `openspecDir`, paths matching
  `<PROJECT_ROOT>/.worktrees/<safe-id>/openspec/…` are accepted.
- **`safe-id`** = single path segment, `[A-Za-z0-9._-]+`, no `..`,
  no `/`. Enforced via a regex against the `.worktrees/`-relative
  first segment.
- The toggle endpoint (`POST /api/tasks/toggle`) inherits the
  relaxed check unchanged — same `applyToggle` + `writeFile` +
  `watcher.recordWrite` sequence.
- **Broadcast**: the per-job worktree tasks watcher
  (`add-worktree-tasks-watcher`) already picks up filesystem writes
  and emits `worktree-progress-updated`. No new WS message needed —
  the toggle write path lands, the watcher fires, the WS event ships.

### UI: symmetric main ↔ worktree toggle Link

- **`web/src/pages/ChangeDetail.tsx`**: the `detail-worktree-badge`
  (`<span>worktree</span>`) becomes a `<Link>` when NOT already on
  the worktree view. Click switches to `?tree=worktree`.
- Text stays terse: `worktree · switch to worktree view` when active
  on main; the existing `viewing worktree · switch to main` pill on
  worktree view is untouched (already a Link).
- When on worktree view, the badge is not rendered (the pill in the
  h2 covers the switch — no double-affordance).
- Update the badge title tooltip to drop the misleading "not yet
  merged to main" wording, which is stale for orphaned-post-merge
  cases (observed in `add-electron-shell` verify flow).

### Docs

- `docs/architecture/parallel-shells.md`: one paragraph noting that
  worktree tasks.md is writable via the same endpoint (with the safe
  path scope), so verify-in-worktree can tick from the UI.

## Capabilities

### Modified Capabilities

- `dashboard`: task toggle writeback now covers `.worktrees/*/openspec/`
  in addition to the main `openspec/` dir; ChangeDetail's worktree
  badge is now a bidirectional toggle Link.

## Impact

- `server/index.ts::withinOpenspec()` — regex + scope extension
- `server/util/auth.test.ts` or new `server/util/paths.test.ts` — unit
  tests for the extended check (accepts worktree paths; rejects
  `.worktrees/../foo`, `.worktrees/id/../../etc`, non-openspec
  subpaths inside worktree)
- `web/src/pages/ChangeDetail.tsx` — badge → Link conversion, tooltip
  wording
- `web/src/styles.css` — reuse `detail-tree-pill` styles for the
  main-view badge Link, or a small variant

## Out of scope

- **Watch worktree openspec dirs from the server directly.** The
  per-job worktree tasks watcher already exists; we do not add a
  global watcher for `.worktrees/*/openspec/` (per-job is enough,
  no active job → no live progress to broadcast anyway).
- **Ticking against a worktree that has no active job.** The path
  check accepts the write; the WS broadcast requires a job with a
  watcher. Without an active job, the UI relies on its own optimistic
  update + a subsequent `state-updated` refresh. Acceptable for v1.
- **Path escape via symlinks.** `resolve()` follows the string; we
  do NOT `realpath` to check for symlinked escapes. Same trust
  boundary as today's `openspecDir` check. Local-only server, no
  remote input.
- **Deprecating the `worktree` badge.** We keep it as an affordance
  (now clickable) — removing it entirely would lose the "you have a
  worktree" signal on main view.
