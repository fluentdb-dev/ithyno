# Outcome: add-agent-start-proposal-guard

## ✅ Worked

- **Silent failure → explicit modal.** Before this change, clicking
  Start (Worktree) on a change whose proposal was untracked in
  main silently created an empty worktree; agent halted at
  ithy-opsx-apply's preflight because the proposal wasn't in the
  worktree's tree. Now the dashboard preempts that with a modal
  listing the uncommitted files and offering `Commit & Start` or
  `Cancel`.
- **Verified end-to-end via dogfooding.** Session ran the exact
  broken path (`/opsx:propose "…"` in embedded terminal → click
  Start on the freshly-untracked card) and got the modal, listed
  the untracked proposal.md / tasks.md / specs/, clicked
  `Commit & Start`, and the agent spawned into a worktree that
  actually contained the proposal.
- **Endpoints are minimal + reusable.** `GET
  /api/changes/:id/git-state` and `POST
  /api/changes/:id/commit-proposal` are two tiny handlers that any
  future UI can use (e.g., a Kanban card badge showing "uncommitted"
  state).

## ⚠️ Surprises

- **Safe-id regex duplicated across the codebase.** The
  git-state / commit-proposal endpoints shell out to git with
  `<id>` embedded in a filesystem path, so they gate on the same
  `SAFE_CHANGE_ID = /^[A-Za-z0-9._-]+$/` that
  `add-worktree-task-toggle-writeback` also uses in server-side
  guards. Fine, but a shared helper module would be nicer — noted
  as a small future refactor.
- **`git commit -m "propose: <id>"`** is a hard-coded subject in
  the server. Users who prefer a different verbal shape (e.g.,
  "chore: propose …" for conventional-commits) have no override.
  Left as-is because this is the auto-generated case and users
  who want a different shape can commit manually.
- **Terminal-branch Start is deliberately unaffected.** The
  `/opsx:apply` inject into the embedded terminal reads main tree
  files, so uncommitted proposals ARE visible there and no modal
  is needed. Contrast with Worktree branch: `git worktree add HEAD`
  never sees untracked files.

## 🔁 Differently

- Considered a runner-side fix (auto-copy the untracked change dir
  into the worktree, or auto-commit before `git worktree add`) —
  see `include-uncommitted-proposal-in-worktree` line of thinking
  from earlier in the session. Rejected in favor of the UI-side
  gate because the runner-side auto-commit would make an
  irreversible git commit invisibly, and the auto-copy would leave
  the worktree in a subtly-dirty state that surprises agents.
  Putting the decision in front of the user is honest.
- Considered a Kanban card badge for "uncommitted proposal" state
  so users see the problem BEFORE clicking Start. Kept for a
  follow-up — the Start-time modal is enough for the immediate
  footgun and adding a card badge introduces a whole other design
  question (what does the badge look like on Discard-eligible
  cards? etc.).

## 🌱 Follow-ups

- **Kanban card "uncommitted proposal" badge.** Complements this
  change's Start-time gate by making the state visible without
  requiring a click. Nice-to-have, not urgent.
- **Shared safe-id helper.** `server/util/change-id.ts` or
  similar exposing the `SAFE_CHANGE_ID` regex used by both this
  change's endpoints and `add-worktree-task-toggle-writeback`'s
  `withinOpenspec` guard. Small.

## 📋 Verify notes

- §7.1 verified via UI (untracked propose + Start → modal appears
  with the correct file list).
- §7.2 verified via UI (`Commit & Start` → main gains
  `propose: <id>` commit → agent spawns into a worktree that
  includes the proposal).
- §7.3 not tested this session — cancel path is symmetric to §7.2
  minus the commit step; low risk.
- §7.4 not tested — pre-committed proposal path is the default
  legacy behavior, unchanged code path.
- §7.5 not tested — Terminal branch's Start goes through a
  different code path (inject into embedded terminal, no modal
  gating).
- §7.6 not tested via curl — the SAFE_CHANGE_ID guard is a simple
  regex + exact-match check that treats "." and ".." as invalid.
  Treat any bypass as a bug.
