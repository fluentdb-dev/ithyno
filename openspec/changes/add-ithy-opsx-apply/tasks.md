## 1. Skill

- [x] 1.1 Create `.claude/skills/ithy-opsx-apply/SKILL.md` with the wrap-`/opsx:apply`-plus-commit steps (preflight → delegate → porcelain check → commit or skip → report)
- [x] 1.2 Commit-message template `agent: implement <id>` + summary from tasks / proposal Why
- [x] 1.3 No `--no-verify` on hook failure

## 2. Slash command

- [x] 2.1 Create `.claude/commands/ithy-opsx/apply.md` — minimal entry that says "follow the ithy-opsx-apply skill for change $ARGUMENTS"

## 3. `agents.yaml`

- [x] 3.1 `agents.yaml.example`: bundled Claude entry's `initialInput` becomes `/ithy-opsx:apply ${change_id}`; added comment explaining the swap and pointing at `/opsx:apply` as the opt-out (plus a `claude-plain` commented alternative)
- [x] 3.2 `agents.yaml` (this repo's own copy): switched to `/ithy-opsx:apply ${change_id}` so dogfood runs the new path

## 4. Docs

- [x] 4.1 `docs/architecture/parallel-shells.md` — new "The Claude default agent auto-commits at end-of-apply" section, above the archive one

## 5. Archive skill note

- [x] 5.1 `.claude/skills/ithy-opsx-archive/SKILL.md` step 2 now carries a note that the safety net is a no-op when the default `/ithy-opsx:apply` was used, but is retained for defense-in-depth against non-Claude agents / interrupted runs

## 6. Verification

- [ ] 6.1 Fresh worktree Start of a small change → agent runs → apply skill's commit step drafts a message
- [ ] 6.2 Approve the message → `agent/<id>` branch has a single implementation commit on top of main
- [ ] 6.3 Run `/ithy-opsx:archive <id>` → step 2 finds a clean worktree tree (no-op), step 3 merges the agent commit into main, steps 5-6 archive + commit
- [ ] 6.4 Clean-tree apply (no changes needed) → skill reports "nothing to commit" and returns without failing
- [ ] 6.5 Pre-commit hook rejects → skill surfaces the message and stops; no `--no-verify`
