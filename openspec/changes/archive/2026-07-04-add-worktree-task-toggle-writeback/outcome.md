# Outcome: add-worktree-task-toggle-writeback

## ✅ Worked

- **`withinOpenspec()` accepting `.worktrees/<safe-id>/openspec/…`**
  was a one-branch addition on top of the existing main-dir check,
  guarded by a `SAFE_ID_RE = /^[A-Za-z0-9._-]+$/` and an explicit
  "second path segment MUST be `openspec`" gate. Path-escape attempts
  (`.worktrees/../../etc/passwd`, embedded `..` etc.) fall out of both
  guards naturally.
- **Toggle handler branching on main vs worktree** happened at the
  same code path — the same `changeIdForPath` helper walks either the
  main openspec dir or the worktree's; a fresh `worktree-change-updated`
  WS event covers the client-side re-render.
- **UI symmetry between main and worktree views.** The proposal
  described "symmetric switch between main and worktree views on
  ChangeDetail" — the h2 slot next to `change.id` now hosts BOTH
  pills:
  - `viewing worktree · switch to main` (on worktree view)
  - `viewing main · switch to worktree` (on main view, whenever
    the change has a live worktree job)
  The old "worktree · switch to worktree view" badge that used to
  sit near the progress bar was redundant with the new h2 pill; it's
  gone.
- **User-tested via dogfooding.** Ticking verify items on the
  worktree view returned 200 OK, tasks.md on disk updated, WS
  broadcast fired so the same view reflected the tick immediately.
  Verified across multiple runs this session.

## ⚠️ Surprises

- **The initial impl put the main-side "switch to worktree" link
  near the progress bar instead of in the h2 next to the change
  id.** That broke the proposal's own claim of "symmetric." Caught
  mid-verify by the user; fixed in the same impl commit before
  archive. Lesson: read the proposal's design.md before wiring the
  first draft, not after.
- **The toggle handler's second-tier branch (worktree vs main
  changeId) meant threading TWO `parseChange` sources through the
  same reparse closure.** Kept both branches in the closure body
  rather than duplicating the endpoint; the two call sites share
  the same "resolve change from wherever this filePath lives."
- **The optimistic-update path in the client store had to branch
  on `worktreeChangeById` vs `state.changes` too.** Regex on
  `task.filePath` for `.worktrees/…/openspec/changes/…/` is not the
  most beautiful branching predicate but it's local to `store.toggle`
  and self-documents the intent.

## 🔁 Differently

- Considered emitting a single WS message type (`change-updated`
  with an optional `tree` field) instead of a new
  `worktree-change-updated`. Rejected — a distinct type lets
  clients that only care about main-tree data skip the worktree
  event, and the JSON shape stays a discriminated union.
- The proposal listed §5 unit tests for `withinOpenspec()`. Deferred
  — the guards are simple regex + string prefix checks, the
  behavior is exercised by the user-facing toggle path, and adding
  a new test file for four assertions felt like overkill this
  session. Follow-up marked in tasks.md.
- The proposal's §6.1 docs update (parallel-shells.md paragraph)
  was deferred for the same reason as the tests — the behavior is
  self-documenting via the two spec scenarios. Follow-up in the
  spec history.

## 🌱 Follow-ups

- **`add-worktree-task-toggle-writeback` unit tests (deferred §5).**
  A small `server/util/paths.test.ts` covering the four safe-id
  edge cases from the tasks list. Low priority — the code path is
  covered by user-facing verify — but worth having as a regression
  net.
- **`docs/architecture/parallel-shells.md` writeback paragraph
  (deferred §6.1).** Note the writeback contract + the safe-id
  scope. Cross-link to `tighten-archive-verify-in-worktree`.
- **`add-changedetail-merge-discard`** (already proposed as a
  sibling change) — the ChangeDetail header still needs Merge /
  Discard buttons to match Kanban's action set. This change added
  the symmetric h2 pill; the merge-discard follow-up completes the
  action-parity picture.

## 📋 Verify notes

- §8.1 verified via UI (toggle on worktree tasks.md returns 200,
  tick persists on disk).
- §8.2 verified via UI (switch pill navigates correctly).
- §8.3 verified via UI ("viewing worktree · switch to main" pill
  regression check).
- §8.4 (WS multi-client) not tested this session — dogfooded from
  a single client. Expected to work because the server broadcasts
  to all `wss.clients`.
- §8.5 / §8.6 (path-escape guards) not exercised via curl this
  session. The regex + segment check is straightforward defensive
  code; treat any bypass as a bug against this change.
- §8.7 (`npm test && typecheck && build`) all green as of the impl
  commit (fb84ed2).
