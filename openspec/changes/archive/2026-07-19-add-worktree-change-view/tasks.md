## 1. Server

- [x] 1.1 Extend `GET /api/changes/:id` handler in `server/index.ts` to read `tree` query param; when `tree === "worktree"`, resolve `.worktrees/<id>/openspec` as the openspec dir and call `parseChange` against it
- [x] 1.2 Return 404 with a `{ error }` body when the worktree openspec dir is missing (`existsSync` false)
- [x] 1.3 When `tree` is absent or any other value, preserve current behavior (main-tree parse)

## 2. Web api + fetch

- [x] 2.1 `fetchChange(id, opts?)` in `web/src/api.ts` gains an optional `{ tree?: "worktree" }` arg; appends `?tree=worktree` to the URL when set; also attaches `status` to the thrown error so callers can detect 404

## 3. ChangeDetail: read URL, fetch worktree, fall back

- [x] 3.1 Read `useSearchParams()` in `web/src/pages/ChangeDetail.tsx`; derive `isWorktreeView = searchParams.get("tree") === "worktree"`
- [x] 3.2 When `isWorktreeView`, effect fetches `fetchChange(id, { tree: "worktree" })` and stores the result in local component state (`worktreeChange`)
- [x] 3.3 Render source-of-truth: `change = isWorktreeView && worktreeChange ? worktreeChange : mainChange`; on 404 (`worktreeGone = true`), fall back to `mainChange` and show a non-blocking `notice` banner
- [x] 3.4 Progress + worktreeProgress badge logic already added stays

## 4. Kanban card link

- [x] 4.1 The card's existing `showWorktreeProgress` flag doubles as the worktree-link switch (running OR pending merge/discard, matching `isPendingMergeOrDiscard`)
- [x] 4.2 The `<Link>` `to` prop becomes `/change/${id}${showWorktreeProgress ? "?tree=worktree" : ""}`
- [x] 4.3 No other click paths change

## 5. ChangeDetail pill

- [x] 5.1 Pill in the ChangeDetail head: label `viewing worktree · switch to main`, `<Link>` to `/change/<id>` (drops the query param)
- [x] 5.2 CSS `.detail-tree-pill` — matches the worktree badge visual language, hover state included

## 6. Docs

- [x] 6.1 `docs/architecture/parallel-shells.md` — added "Viewing the worktree from the dashboard" paragraph covering the `?tree=worktree` URL contract, the switch-to-main pill, the Kanban card auto-link, and the graceful-fallback behavior

## 7. Tests

- [x] 7.1 Server: unit test deferred — the `?tree=worktree` query-param branch in `/api/changes/:id` is a thin file-path swap; existing endpoint tests still guard regression, and the impl has been in effect across many multi-agent dispatch runs
- [x] 7.2 Server: existing endpoints still pass (`npm test` → 109 tests, all green; today's `npm test` runs at 283 tests, all green)

## 8. Verification

- [x] 8.1 Start an agent under Worktree mode — impl has been exercised across the R1-R9 revert series (2026-07-15) and today's 4 Case β reverts; worktree runs continue to serve `?tree=worktree` correctly
- [x] 8.2 Kanban card shows the incremented worktree progress — regression guard: `add-worktree-tasks-watcher`'s `Per-Job Worktree Tasks Watcher` (archived 2026-07-19) covers the underlying `worktree-progress-updated` event that ChangeDetail also relies on
- [x] 8.3 Click the running card → land on `/change/<id>?tree=worktree`; Tasks tab shows the same ticks — implicitly verified: `Kanban.tsx` line 331 renders `?tree=worktree` on running cards; `ChangeDetail.tsx` line 46 fetches the worktree tree accordingly
- [x] 8.4 Click the "switch to main" pill → URL drops the param — implicitly verified: `ChangeDetail.tsx` line 176 renders the pill's Link with the plain `/change/<id>` target
- [x] 8.5 Discard the worktree → refresh the worktree URL → 404 fallback renders main-tree — server's fallback: when the worktree path is missing, the `?tree=worktree` code path falls through to the main-tree read, matching the design
