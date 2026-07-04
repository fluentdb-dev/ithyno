## Context

`add-worktree-change-view` added `?tree=worktree` for reading worktree
tasks.md; `add-worktree-tasks-watcher` added the per-job worktree
progress broadcast. The remaining gap is **writeback**: the toggle
endpoint refuses worktree paths, so users cannot tick tasks (verify or
otherwise) while looking at the worktree view.

The related UI ask (from the `add-electron-shell` verify session) is a
symmetric switch between main and worktree views on ChangeDetail. The
existing "switch to main" pill has no counterpart on the main view.

## Constraints

- **Local-only server** — same trust boundary as today. No remote
  input; path checks are string-based, no `realpath`.
- **No new watcher plumbing** — the per-job worktree tasks watcher
  already fires on writes and broadcasts `worktree-progress-updated`.
- **safe-id** on worktree segments — reject `..`, path separators,
  and anything that would let a caller escape `.worktrees/`. Regex
  `^[A-Za-z0-9._-]+$` matches change ids in use today.

## Decisions

### Extend `withinOpenspec()`, don't split it

Two options:

**Option A**: New `withinAllowedTaskPath()` covering both openspec dir
and worktree openspec dirs; leave `withinOpenspec()` for the strict
main-dir check.

**Option B**: Extend `withinOpenspec()` itself.

**Chosen: B**. Every current caller of `withinOpenspec()` (two:
`/api/preview` and `/api/tasks/toggle`) should accept worktree paths —
the only reason it doesn't today is that the check predates the
worktree view. A rename introduces churn for no additional safety.

Function body:

```
function withinOpenspec(filePath: string): boolean {
  if (!openspecDir) return false;
  const abs = resolve(filePath);
  if (abs === openspecDir || abs.startsWith(openspecDir + sep)) return true;
  // add-worktree-task-toggle-writeback: also accept worktree openspec dirs
  const worktreesRoot = join(PROJECT_ROOT, ".worktrees");
  if (!abs.startsWith(worktreesRoot + sep)) return false;
  const rel = abs.slice(worktreesRoot.length + 1);
  const parts = rel.split(sep);
  if (parts.length < 2) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(parts[0])) return false;
  if (parts[1] !== "openspec") return false;
  return true;
}
```

The regex on `parts[0]` enforces safe-id. The `parts[1] === "openspec"`
gate prevents writes to worktree files outside the openspec subtree
(e.g., worktree source code).

### Watcher: no changes needed

The toggle endpoint calls `watcher?.recordWrite(filePath, result.newHash)`
before returning. That watcher is the **global** openspec watcher on the
main dir — it will not fire on worktree writes. That's fine: the
worktree write's WS broadcast comes from the per-job worktree tasks
watcher (`add-worktree-tasks-watcher`), which fires independently.

Detail: `recordWrite()` on the global watcher for a path outside its
watched tree is a no-op (the internal `pendingWrites` map keys by
absolute path; nothing consumes the entry for an unwatched path). So
we can leave the call as-is — no branch needed to skip it for
worktree paths.

### Broadcast semantics

- **Main dir tick**: `broadcast({ type: "change-updated", changeId, change })`
  as today. The main-tree `Change` object refreshes for all listeners.
- **Worktree dir tick**: the toggle endpoint should also emit
  `change-updated` — but the `change` payload should reflect the
  **worktree's** parsed state, so clients that fetched the worktree
  view have fresh data. AND the per-job watcher will fire
  `worktree-progress-updated` for the progress bar.

  We handle this by re-parsing from the worktree dir when the toggle
  path is under `.worktrees/`. Client-side, `ChangeDetail` already
  differentiates worktree vs main change; the WS `change-updated` for
  worktree state updates the local `worktreeChange` state via a small
  new store handler.

Actually simpler: on worktree ticks, DON'T emit `change-updated` from
the endpoint at all — rely on the per-job worktree watcher's
`worktree-progress-updated` for the progress bar + a client-side
`fetchChange(id, {tree: "worktree"})` refresh triggered by that event.
The UI already refetches on `worktree-progress-updated` if we add a
handler; otherwise the optimistic tick + next reload is enough for v1.

**Chosen v1**: emit `change-updated` with the reparsed **worktree** state
under a new WS message type `worktree-change-updated`. Client-side
`ChangeDetail` listens for it (when `isWorktreeView === true`) and
updates `worktreeChange`. Symmetric to the existing main-tree
broadcast. One-line change on server, one useEffect on client.

### UI: badge → Link, keep the visual weight

The current `.detail-worktree-badge.muted` span becomes a `<Link>` with
the same class. Styling stays "muted" (small, low-emphasis) — this is
navigation, not a call-to-action. The existing "switch to main" pill
uses `detail-tree-pill` styling; that stays.

Text options:

```
worktree progress · switch to worktree view    ← too long
switch to worktree                              ← ambiguous
worktree · view                                 ← too terse
```

**Chosen**: `worktree · switch to worktree view` (same shape as the
counterpart pill's `viewing worktree · switch to main`). Compact and
symmetric.

## Alternatives considered

### Server: whitelist per-job worktree paths

Only accept writes for worktrees that have an **active job**. Rejected:
adds coupling between the path check and the runner's job registry,
and the safety benefit is marginal — the safe-id regex already blocks
escapes. A user who ticks a worktree that has no active job simply
gets a write with no live broadcast (acceptable, see Out of scope).

### UI: hide the badge entirely when clickable

Show only the pill on worktree view, nothing on main view. Rejected:
the "you have a worktree" signal is useful — new users don't know
there's a second view to switch to. The badge doubles as a
discovery affordance.

## Migration

- No data migration. Existing worktree views continue to work read-only
  until the code lands; after it lands, ticks succeed.
- Path check test suite gains cases for worktree paths (accept /
  reject).

## Rollout

- Land server + tests + UI in one commit.
- Verify against `add-electron-shell` (the observed failure case):
  open `?tree=worktree` view, tick 10.1, confirm `200 OK` + WS
  updates the badge.
