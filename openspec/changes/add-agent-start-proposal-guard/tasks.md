## 1. Server: git-state endpoint

- [ ] 1.1 `GET /api/changes/:id/git-state` handler in `server/index.ts` — auth-gated (same middleware everything else uses); returns `{ untracked: string[], modified: string[] }`
- [ ] 1.2 Implementation: `git status --porcelain -- openspec/changes/<id>/` via `execFile`; parse the `??` / ` M` / `A ` prefixes into the two arrays; paths are relative to project root
- [ ] 1.3 Guard: reject if `<id>` contains `/`, `..`, or characters outside `[A-Za-z0-9._-]` — same safe-id regex the toggle writeback uses
- [ ] 1.4 Return `{ untracked: [], modified: [] }` when the change dir doesn't exist at all — the pre-check is defensive, not a validity check

## 2. Server: commit-proposal endpoint

- [ ] 2.1 `POST /api/changes/:id/commit-proposal` handler in `server/index.ts`
- [ ] 2.2 Implementation: `git add openspec/changes/<id>/` then `git commit -m "propose: <id>"`; returns `{ ok: true, commitHash: string }` or `{ ok: false, reason: string }` (409 when nothing to commit)
- [ ] 2.3 Same safe-id regex guard as §1.3
- [ ] 2.4 Local-only check (already covered by the shared `isLocal` middleware, but the endpoint mutates so double-check)

## 3. Web: API helpers

- [ ] 3.1 `web/src/api.ts`: `fetchChangeGitState(id): Promise<{ untracked: string[], modified: string[] }>`
- [ ] 3.2 `web/src/api.ts`: `commitChangeProposal(id): Promise<{ commitHash: string }>` — throws on non-2xx

## 4. Web: modal component

- [ ] 4.1 `web/src/components/UncommittedProposalModal.tsx` — props: `{ changeId, files, onCommitAndStart, onCancel }`
- [ ] 4.2 List the untracked + modified files in a scrollable region so a large delta doesn't blow out the modal
- [ ] 4.3 Two buttons: `Commit & Start` (primary), `Cancel` (ghost); Escape closes = Cancel; click on backdrop = Cancel

## 5. Web: gate the Start (Worktree) flow

- [ ] 5.1 In `web/src/hooks/useStartFlow.tsx::startImplementation`, before `runAgent`, `await fetchChangeGitState(change.id)`
- [ ] 5.2 If `untracked.length > 0 || modified.length > 0`, set `uncommittedPending` state (like `applyPending`) and return early
- [ ] 5.3 `startFlowModals` renders `<UncommittedProposalModal>` when `uncommittedPending` is set
- [ ] 5.4 `Commit & Start` handler: `await commitChangeProposal(id)` → clear `uncommittedPending` → call `startWorktreeFlow(change)` (the same function the default path calls)
- [ ] 5.5 `Cancel` handler: clear `uncommittedPending`; no toast (user cancelled deliberately)
- [ ] 5.6 The Terminal branch of Start is unchanged — the modal only intercepts the Worktree branch

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-agent-start-proposal-guard/specs/dashboard/spec.md`: MODIFIED requirement — Start (Worktree mode) SHALL surface a modal when the target change's `openspec/changes/<id>/` has uncommitted files

## 7. Verification

- [ ] 7.1 `/opsx:propose "some-test-change"` in the embedded terminal; DO NOT commit; click Start (Worktree) → modal appears listing the new `proposal.md` etc.
- [ ] 7.2 Click `Commit & Start` → modal closes → new commit lands on main (`propose: some-test-change`) → agent worktree is created from the fresh commit → agent finds the proposal and proceeds
- [ ] 7.3 Repeat 7.1 but click `Cancel` → nothing happens; `git status` still shows the untracked files; no agent spawn
- [ ] 7.4 Commit the proposal manually, then click Start → no modal (endpoint returns empty arrays); agent spawns straight into the worktree
- [ ] 7.5 Start (Terminal) mode with an uncommitted proposal: no modal appears; the embedded `/opsx:apply` runs against main tree files as before
- [ ] 7.6 `POST /api/changes/:id/commit-proposal` with a change id containing `..` → 400 (safe-id guard)
