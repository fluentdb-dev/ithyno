## 1. Decide hook shape

- [ ] 1.1 Read `useStartFlow.tsx` and Kanban's `onMergeClick` / `onDiscardClick` inline handlers; decide whether to extend `useStartFlow` (returns `{ startImplementation, mergeAction, discardAction, startFlowModals }`) or create a sibling `usePostRunActions` hook
- [ ] 1.2 Document the decision in one paragraph at the top of the chosen file

## 2. Extract Merge / Discard action wiring

- [ ] 2.1 Move the CommandModal pending-command state (`kind: "agent-merge" | "agent-discard"`) into the hook
- [ ] 2.2 Move the `buildPendingCommand()` command-string builder (or its Merge/Discard branches) into the hook
- [ ] 2.3 Expose `mergeChange(change, job)` and `discardChange(change, job)` functions
- [ ] 2.4 Expose the modal JSX (same "return JSX not component" pattern used in `useStartFlow`)

## 3. Refactor Kanban to use the hook

- [ ] 3.1 Replace the inline `onMergeClick` / `onDiscardClick` handlers with hook calls
- [ ] 3.2 Verify the CommandModal render surface stays the same (regression check: no visible UX change on Kanban)
- [ ] 3.3 Ensure `worktreeProgress` clear-on-success logic still fires (moved into the hook or left in Kanban's onSuccess callback)

## 4. Add buttons to ChangeDetail

- [ ] 4.1 In `web/src/pages/ChangeDetail.tsx` header, resolve the latest job for the change (same `Object.values(jobs).filter(...).sort(...)` pattern already used)
- [ ] 4.2 Reuse `isPendingMergeOrDiscard(job)` predicate from `web/src/components/Kanban.tsx` (extract to `util/changeState.ts` if not already there)
- [ ] 4.3 Render Merge + Discard buttons in the header when the predicate is true; positioned near the existing Archive button
- [ ] 4.4 Buttons wire to the hook's `mergeChange` / `discardChange`
- [ ] 4.5 Style: keep `action-btn` + `action-btn ghost` weighting consistent with Kanban

## 5. Spec delta

- [ ] 5.1 `openspec/changes/add-changedetail-merge-discard/specs/dashboard/spec.md`: MODIFIED requirement — ChangeDetail's action row exposes Merge / Discard when a job is in a post-run state

## 6. Verification

- [ ] 6.1 Start an agent under Worktree mode from Kanban; Cancel it → orphaned state
- [ ] 6.2 On Kanban card: Merge button injects `git merge …` (or `/ithy-opsx:merge` depending on commandStyle) — regression check unchanged
- [ ] 6.3 Navigate to ChangeDetail for the same change: Merge button present, click → same command in embedded terminal
- [ ] 6.4 Discard button on ChangeDetail: injects `git worktree remove …` + `git branch -D …`
- [ ] 6.5 When there's no post-run job (fresh TODO change), Merge / Discard buttons are NOT rendered on ChangeDetail
- [ ] 6.6 Update `openspec/changes/archive/2026-07-03-add-agent-runner/outcome.md` Follow-ups: note that §13.5 / §13.6 verify is now doable from both Kanban and ChangeDetail
