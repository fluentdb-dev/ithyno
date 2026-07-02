## 1. Skill

- [x] 1.1 Create `.claude/skills/ithy-opsx-archive/SKILL.md` with the six-step body (preflight → optional merge → openspec archive → commit → cleanup ask → report)
- [x] 1.2 Include the auto-generated commit message template in the skill so Claude produces the same shape every time
- [x] 1.3 Document that the skill pauses on merge conflict — user resolves, re-runs

## 2. Slash command

- [x] 2.1 Create `.claude/commands/ithy-opsx/archive.md` — minimal entry that says "follow the ithy-opsx-archive skill for change $ARGUMENTS"

## 3. Dashboard rewire

- [x] 3.1 `web/src/components/Kanban.tsx` `buildPendingCommand` archive branch: emit `/ithy-opsx:archive ${id}` when `m === "claude"` (was `/opsx:archive`)
- [x] 3.2 `web/src/components/Kanban.tsx` `modalSubmitLabel` archive branch: label reads `Send /ithy-opsx:archive` in claude mode (was `/opsx:archive`)
- [x] 3.3 `web/src/pages/ChangeDetail.tsx` `build` function: same substitution — `/ithy-opsx:archive` when the tab / mode is Claude
- [x] 3.4 `web/src/pages/ChangeDetail.tsx` `submitLabel`: same wording update

## 4. Idea file promotion

- [x] 4.1 `docs/ideas/2026-07-01-merge-workflow-and-namespace.md` frontmatter:
  - `status: promoted`
  - `promoted_to: openspec/changes/add-ithy-opsx-archive/proposal.md`
- [x] 4.2 Added a Promotion note in the body pointing at this change and noting `/ithy-opsx:merge` remains open

## 5. Docs

- [x] 5.1 `docs/architecture/parallel-shells.md`: new "Archiving as a single git commit" section pointing at the skill file and the change

## 6. Verification

- [ ] 6.1 Kanban DONE column Archive button → modal preview shows `/ithy-opsx:archive <id>` in Claude mode
- [ ] 6.2 Switch to CLI mode → preview shows `npx openspec archive <id>` (unchanged)
- [ ] 6.3 Confirm the send → embedded terminal receives the correct line
- [ ] 6.4 Live smoke test with a small change: run through preflight → merge → archive → commit → cleanup — verify the git log has one clean commit and the worktree is gone
- [ ] 6.5 Confirm the idea file's frontmatter is promoted and links back to this proposal
