---
tags: [feature/git, feature/merge, area/skills, area/web]
---

## Why

Kanban's Merge button injects the raw command
`git merge --no-ff agent/<id>` into the embedded terminal. That works
when the main tree is clean, but it fails whenever there are
uncommitted local changes — which, in the dogfooding loop, is
constantly. The user hits:

```
error: Your local changes to the following files would be
overwritten by merge:
  server/index.ts
  web/src/api.ts
Please commit your changes or stash them before you merge.
Aborting
```

…and has to remember to `git stash`, retry the merge, resolve any
conflicts, `git stash pop`, resolve again. That's the same
mechanical dance we've done four times in this session by hand.
`/ithy-opsx:archive` already handles a superset of this flow
(commit + merge + archive + commit + cleanup) but there is no
merge-only entry point. Users who want to review the merge
independently of archiving have no comparable skill.

## What Changes

### New slash command + skill

- `.claude/commands/ithy-opsx/merge.md` — thin command entry that
  instructs Claude to follow the skill.
- `.claude/skills/ithy-opsx-merge/SKILL.md` — full merge flow:
  1. **Preflight.** `agent/<id>` branch exists; git identity is set;
     read `git status --porcelain` and record whether the main tree
     is dirty.
  2. **Auto-stash** (only if dirty). `git stash push -u -m "wip
     pre-merge <id>"`. Remember the stash ref.
  3. **Merge.** `git merge --no-ff agent/<id>`.
     - On conflict: pause with a clear message ("resolve in your
       editor, then re-run `/ithy-opsx:merge <id>` — the stash from
       step 2 stays in place until pop succeeds"). Do NOT
       automatically pop; the user needs to finish the merge
       resolution first.
  4. **Auto-pop** (only if step 2 stashed). `git stash pop`.
     - On conflict: pause with the same message shape ("resolve in
       your editor; the stash entry stays until you `git stash drop`
       manually, or is automatically dropped by a clean pop later").
  5. **Cleanup (ask).** `git worktree remove .worktrees/<id>` + `git
     branch -D agent/<id>`. Default suggestion: yes.
  6. **Report.** Show the merge commit hash + subject and whether
     the worktree was cleaned up.

### Kanban Merge button rewire

- `web/src/components/Kanban.tsx::buildPendingCommand` (or the
  merge branch of it): when `commandStyle === "claude"`, inject
  `/ithy-opsx:merge <id>` instead of the raw `git merge --no-ff
  agent/<id>`. CLI mode is unchanged.
- The CommandModal preview updates to reflect the new command
  string (mirroring `add-ithy-opsx-archive`'s pattern).

### Docs

- `docs/architecture/parallel-shells.md`: one paragraph noting the
  merge skill and how it composes with archive (they share step 2's
  auto-stash contract).

## Capabilities

### Modified Capabilities

- `dashboard`: Kanban Merge (Claude mode) now injects
  `/ithy-opsx:merge`, which runs the auto-stash + merge + auto-pop
  + optional cleanup sequence.

## Impact

- `.claude/commands/ithy-opsx/merge.md`
- `.claude/skills/ithy-opsx-merge/SKILL.md`
- `web/src/components/Kanban.tsx` (buildPendingCommand)
- `docs/architecture/parallel-shells.md` (one paragraph)

## Out of scope

- **Server-side merge endpoint.** The skill runs `git` in the
  embedded terminal; the server never executes the merge itself.
  Same architectural choice as archive.
- **Interactive conflict-resolution UI.** The skill pauses; user
  resolves in their editor / terminal; re-runs `/ithy-opsx:merge`
  or continues manually.
- **`/opsx:merge` upstream compatibility.** OpenSpec's own workflow
  does not ship a merge slash command; this is purely ithy-flavored.
  CLI-mode users still get the bare `git merge` (no auto-stash).
- **Auto-commit of the dirty state.** Considered (commit local as
  "wip:" then merge), rejected: user usually wants their WIP kept
  separate from the merge commit. The stash-then-pop dance preserves
  that separation naturally.
