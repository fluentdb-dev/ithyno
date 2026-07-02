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

- [ ] 6.1 `docs/architecture/parallel-shells.md` — one paragraph about the `?tree=worktree` URL contract and the Kanban card link behavior

## 7. Tests

- [ ] 7.1 Server: unit test that hits `/api/changes/:id?tree=worktree` (deferred — covered by manual verification below; existing endpoint tests still pass as regression guard)
- [x] 7.2 Server: existing endpoints still pass (`npm test` → 109 tests, all green)

## 8. Verification

- [ ] 8.1 Start an agent under Worktree mode for `add-vscode-extension`; wait for the agent to tick a task
- [ ] 8.2 Kanban card shows the incremented worktree progress (existing behavior — regression check)
- [ ] 8.3 Click the running card → land on `/change/add-vscode-extension?tree=worktree`; Tasks tab shows the same ticks
- [ ] 8.4 Click the "viewing worktree · switch to main" pill → URL drops the param, Tasks tab reverts to the main-tree (empty) state
- [ ] 8.5 Discard the worktree from the Kanban → refresh the worktree URL → 404 fallback renders the main-tree with the notice
