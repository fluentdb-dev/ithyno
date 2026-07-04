## 1. Server: extend `withinOpenspec()` for worktree paths

- [x] 1.1 `server/index.ts::withinOpenspec()` — after the main-dir check, also accept paths matching `<PROJECT_ROOT>/.worktrees/<safe-id>/openspec/…`
- [x] 1.2 `safe-id` regex `^[A-Za-z0-9._-]+$` on the first `.worktrees/`-relative segment; reject anything else
- [x] 1.3 Second segment must equal `openspec` — no writes to worktree code / node_modules / etc.
- [x] 1.4 Preserve the existing `openspecDir` branch; the new branch is added, not substituted

## 2. Server: broadcast worktree change updates

- [x] 2.1 New WS message type `worktree-change-updated` (payload: `{ jobId?, changeId, change }`) in `server/agents/runner.ts` type union (or a dashboard-level types module)
- [x] 2.2 In `POST /api/tasks/toggle`, if the tick path resolved into a worktree, re-parse the change from that worktree's openspec dir and emit `worktree-change-updated` instead of `change-updated`
- [x] 2.3 Main-dir ticks continue emitting `change-updated` unchanged

## 3. UI: main-view worktree Link

- [x] 3.1 `web/src/pages/ChangeDetail.tsx`: convert the `worktree` badge span into a `<Link to={\`/change/<id>?tree=worktree\`}>` when NOT on worktree view
- [x] 3.2 Text: `worktree · switch to worktree view`
- [x] 3.3 Reuse existing `.detail-worktree-badge` styling (add `.muted` + hover cue like `.detail-tree-pill`); no new CSS classes if avoidable
- [x] 3.4 Drop the stale "not yet merged to main" tooltip text — replace with `Progress from the agent's worktree tasks.md. Click to switch to the worktree view.`
- [x] 3.5 On worktree view, the badge is NOT rendered (the h2 pill covers the switch)

## 4. UI: react to `worktree-change-updated`

- [x] 4.1 `web/src/store.ts` WS message handler: on `worktree-change-updated`, if a listener has registered for the change id, update the cached `worktreeChange` (may need a small store slice or a callback registry)
- [x] 4.2 `ChangeDetail` picks up the update: when `isWorktreeView` and the event's changeId matches, replace `worktreeChange` state
- [x] 4.3 Optimistic UI: on tick click while on worktree view, flip the checkbox locally (existing `store.toggle` optimistic path) — same behavior as main-tree ticks

## 5. Server tests

- [ ] 5.1 `server/util/paths.test.ts` (new) — verify `withinOpenspec()` accepts `<root>/openspec/foo.md`, `<root>/.worktrees/change-a/openspec/foo.md`
- [ ] 5.2 Reject `<root>/.worktrees/change-a/foo.md` (no `openspec` segment), `<root>/.worktrees/../etc/passwd`, `<root>/.worktrees/../../foo`, `<root>/.worktrees/id/../../openspec/foo.md`
- [ ] 5.3 Reject `<root>/.worktrees/` with no id segment
- [ ] 5.4 Reject `<root>/.worktrees/bad id/openspec/foo.md` (space in id) and other characters outside `[A-Za-z0-9._-]`

## 6. Docs

- [ ] 6.1 `docs/architecture/parallel-shells.md`: add a paragraph noting that worktree tasks.md is writable via the same endpoint (with safe path scope), so verify-in-worktree can tick from the UI
- [ ] 6.2 Cross-link to `tighten-archive-verify-in-worktree` (verify step depends on this writeback)

## 7. Spec delta

- [ ] 7.1 `openspec/changes/add-worktree-task-toggle-writeback/specs/dashboard/spec.md`: MODIFIED requirement covering worktree writeback + UI toggle Link

## 8. Verification

- [ ] 8.1 Start Electron / dev server; open `add-electron-shell` ChangeDetail on `?tree=worktree`; tick 10.1 → 200 OK from `/api/tasks/toggle`, checkbox stays checked, worktree tasks.md on disk updated
- [ ] 8.2 On main view of the same change, click the `worktree · switch to worktree view` Link → URL becomes `?tree=worktree`, tasks tab renders worktree tasks.md
- [ ] 8.3 On worktree view, the h2 pill `viewing worktree · switch to main` still works (regression check)
- [ ] 8.4 On worktree view WHILE another client has the same view open: tick from client A, client B sees the checkbox update via `worktree-change-updated` (WS multi-client)
- [ ] 8.5 Attempt to POST toggle with `filePath` = `<root>/.worktrees/x/../../etc/passwd` → 400 (path escape blocked)
- [ ] 8.6 Attempt to POST toggle with `filePath` = `<root>/.worktrees/id/README.md` → 400 (openspec segment missing)
- [ ] 8.7 `npm test && npm run typecheck && npm run build` all pass
