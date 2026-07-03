## 1. Slash command entry

- [ ] 1.1 `.claude/commands/ithy-opsx/merge.md` — minimal entry with `$ARGUMENTS` handoff to the skill
- [ ] 1.2 Match the frontmatter shape used by `ithy-opsx/archive.md` (name / description / category / tags)

## 2. Skill body

- [ ] 2.1 `.claude/skills/ithy-opsx-merge/SKILL.md` — Preflight, Auto-stash, Merge, Auto-pop, Cleanup, Report sections
- [ ] 2.2 Preflight checks: `agent/<id>` branch exists (`git rev-parse --verify agent/<id>`); git identity set; capture dirty flag via `git status --porcelain`
- [ ] 2.3 Auto-stash: only if dirty; use `-u` for untracked files, tag the message `wip pre-merge <id>` so the user can find it
- [ ] 2.4 Merge: `git merge --no-ff agent/<id>`; on conflict, DO NOT pop the stash (leave it for after resolution)
- [ ] 2.5 Auto-pop: only if we stashed; on pop conflict, leave the stash entry in place with a clear message
- [ ] 2.6 Cleanup ask: `git worktree remove .worktrees/<id>` + `git branch -D agent/<id>` (default yes)
- [ ] 2.7 Report: merge commit hash + subject; cleanup outcome

## 3. Kanban Merge button rewire

- [ ] 3.1 In `web/src/components/Kanban.tsx`, locate `buildPendingCommand` (or the equivalent switch) for the `agent-merge` kind
- [ ] 3.2 When `commandStyle === "claude"`, return `/ithy-opsx:merge <change-id>` instead of `git merge --no-ff agent/<id>`
- [ ] 3.3 When `commandStyle === "cli"`, return the raw `git merge --no-ff agent/<id>` unchanged
- [ ] 3.4 CommandModal preview label follows the existing pattern (`Send /ithy-opsx:merge` when in claude mode)

## 4. Docs

- [ ] 4.1 `docs/architecture/parallel-shells.md`: paragraph noting the merge skill; cross-link to the archive skill's shared auto-stash contract
- [ ] 4.2 If the root README references the Merge command, update

## 5. Spec delta

- [ ] 5.1 `openspec/changes/add-ithy-opsx-merge/specs/dashboard/spec.md`: MODIFIED "Merge Action Command" requirement with scenarios for claude-mode injection, cli-mode passthrough, and CommandModal preview

## 6. Verification

- [ ] 6.1 With a clean main tree and a completed agent worktree, click Kanban Merge (claude mode) → CommandModal shows `/ithy-opsx:merge <id>` → send → skill runs preflight → merges → offers cleanup
- [ ] 6.2 With a dirty main tree (e.g. an unrelated in-progress edit) and a completed agent worktree, run `/ithy-opsx:merge <id>` → skill auto-stashes → merges → auto-pops → the WIP edits are back
- [ ] 6.3 With a dirty main tree that WILL conflict with the agent branch, run the skill → auto-stashes → merges cleanly → auto-pop conflicts → skill pauses with the "resolve in your editor" message and the stash entry visible in `git stash list`
- [ ] 6.4 CLI mode Merge button still injects the raw `git merge --no-ff …` — regression check on the passthrough
- [ ] 6.5 Cleanup ask fires only after a successful merge + pop; if either paused, the ask is skipped
