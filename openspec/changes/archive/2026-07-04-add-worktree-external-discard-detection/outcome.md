# Outcome: add-worktree-external-discard-detection

## ✅ Worked

- **Chokidar's `unlink` event was the right signal.** The per-job
  `worktree-progress` watcher was already tailing `tasks.md`; adding
  an `unlink` listener on top of the existing `add` / `change`
  handlers was ~10 lines. When the user runs
  `git worktree remove --force .worktrees/<id>`, the file
  disappears, chokidar fires, `onUnlink()` runs, the runner drops
  the job from its maps, and the client receives
  `agent-job-removed` — Kanban card returns to TODO within seconds.
- **`removeJobExternally()` as the sole cleanup entry** kept the
  lifecycle honest. The finish() path used to dispose the watcher;
  now it doesn't (see Surprises), so the watcher stays alive across
  a completed / crashed / cancelled state until the user actually
  removes the worktree. Whoever removes it — UI Discard button,
  terminal, or an editor's git panel — triggers the same
  `unlink` → `removeJobExternally()` funnel.

## ⚠️ Surprises

- **Finish() was disposing the watcher too early.** First impl of
  this change assumed the tasks.md watcher only mattered while the
  agent was actively producing output. Verify §6.1 caught the bug:
  a *completed* job's worktree was externally removed, the watcher
  had already been disposed in finish(), and the Kanban card
  stayed in "inprogress" forever. Fixed inline before archive —
  removed the dispose call from finish(), documented the
  contract in the comment: "Disposal happens in
  removeJobExternally itself."
- **Cancel state was not a problem.** SIGTERM was sent, Claude Code
  in `-p` mode takes 30-90s to actually exit, but the watcher
  keeps running through the wait; if the user externally removes
  mid-cancel, the unlink handler fires cleanly.
- **The `unlink` event fires ONCE per watcher lifetime.** Guarded
  with a local `unlinkFired` boolean so a late dispose can't
  double-fire and cause a `removeJobExternally()` on an already-
  removed job.

## 🔁 Differently

- Considered watching `.worktrees/` at the directory level via a
  single global chokidar instance, filtering on paths. Rejected:
  the existing per-job watcher already knows exactly which job
  it belongs to; a directory watcher would need path-parsing to
  route events, and it would fire for every unrelated file change
  under the tree (agent's own edits). Per-job specificity wins.
- Considered a `state-replaced` broadcast as the cleanup signal
  instead of a new `agent-job-removed` event type. Rejected:
  `state-replaced` triggers a full refetch of `/api/state` on every
  client, which is a lot of network / CPU for a single-job cleanup.
  A discriminated event lets the store drop `jobs[id]` /
  `jobOutputs[id]` / `worktreeProgress[changeId]` surgically.

## 🌱 Follow-ups

- **UI-driven Discard endpoint / button.** This change closes the
  external-discard path but the "click a button in the UI to
  discard" flow is still terminal-command inject in Kanban's
  Merge/Discard preview. A first-class `POST /api/agents/jobs/:id
  /discard` endpoint that runs `git worktree remove` +
  `git branch -D` server-side would let the click work without
  the user having to press Send in a terminal. Separate proposal;
  writeback + external-discard together are enough for v1.
- **`agent-job-removed` for live agents.** The current impl logs
  a warning if the removed job's process is still running (see
  the console.warn in `removeJobExternally`) but does NOT explicitly
  kill the process. The process's cwd is gone, so it will exit
  on its own — but if a future agent CLI is tolerant of missing
  cwd (unlikely) it would linger. Worth revisiting only if we see
  ghosts in the process list.

## 📋 Verify notes

- §6.1 verified via UI (external `git worktree remove` on a
  completed job → card returns to TODO within seconds, Agents
  page job entry disappears, no server restart needed).
- §6.2 (orphan-adoption path) not tested independently this
  session — the fresh-spawn path was exercised, and the code
  supplies the same `onUnlink` callback in both attach sites.
- §6.3 (UI Discard regression) not tested — UI Discard still
  routes through terminal inject; the change does not touch that
  path.
- §6.4 (direct tasks.md unlink without dir removal) not tested —
  documented behavior, low-risk edge case.
- §6.5 (`npm test && typecheck && build`) green as of impl commit
  (fb84ed2) and the follow-up fix.
