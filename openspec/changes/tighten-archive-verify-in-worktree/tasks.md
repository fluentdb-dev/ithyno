## 1. Skill: insert Verify step before Commit

- [ ] 1.1 `.claude/skills/ithy-opsx-archive/SKILL.md`: renumber Steps 2–8 (was 2–7); insert new Step 2 "Verify in worktree"
- [ ] 1.2 Step 2 body: Claude reads `openspec/changes/<id>/tasks.md`, extracts the `## Verification` section (or subsection whose heading contains "verif"), presents each item to the user, waits for them to run the check + tick the box + confirm before advancing to the next
- [ ] 1.3 Step 2 exit condition: all verify items ticked OR user typed `skip verify: <reason>` (reason string captured for use in Step 6 commit trailer)
- [ ] 1.4 Preflight (Step 1): change the verify-unchecked handling from "warn" to "block unless user explicitly requests skip"
- [ ] 1.5 Non-verify unchecked items remain a warn (existing behavior preserved)
- [ ] 1.6 Step 3 (Commit) unchanged in body but header updates from "Commit the agent's uncommitted work (safety net)" to "Commit the worktree-scope state (includes verify ticks)"

## 2. Skill: skip-verify escape hatch in commit trailer

- [ ] 2.1 Step 6 (Commit the archive) — when Step 2 exited via `skip verify: <reason>`, add trailer `Verify: skipped — <reason>` to the commit message template
- [ ] 2.2 When Step 2 exited normally (all verified), no trailer is added
- [ ] 2.3 Trailer placement: above `Tags: ...` if tags exist, otherwise last line of body

## 3. Slash command entry

- [ ] 3.1 `.claude/commands/ithy-opsx/archive.md`: update the numbered summary in the body to reflect the new 8-step flow (was 6-step)
- [ ] 3.2 Add a one-line note under the summary: "Verify pauses on unchecked items — type `skip verify: <reason>` to override"

## 4. Docs

- [ ] 4.1 `docs/architecture/parallel-shells.md`: add "Three acceptance boundaries" subsection explaining worktree commit / merge / archive semantics and where verify sits
- [ ] 4.2 Cross-link from the "Orphan adoption" note (which mentions the Kanban Archive action) to the new subsection

## 5. Spec delta

- [ ] 5.1 `openspec/changes/tighten-archive-verify-in-worktree/specs/dashboard/spec.md`: MODIFIED requirement `Archive Action Command` — add scenarios covering the verify block, the skip escape hatch, and the trailer

## 6. Verification

- [ ] 6.1 Run `/ithy-opsx:archive <id>` against a test change with unchecked verify tasks; confirm the skill blocks at Step 1 (preflight) with a clear message
- [ ] 6.2 Complete verify ticks (as the user would in the worktree), re-run; confirm the skill advances through Steps 2–8 cleanly
- [ ] 6.3 Run `/ithy-opsx:archive <id>` and respond `skip verify: <reason>`; confirm the archive commit contains `Verify: skipped — <reason>` trailer
- [ ] 6.4 Non-verify unchecked items produce a warn (not block) — regression check against Step 1 behavior
- [ ] 6.5 `git log --grep 'Verify: skipped'` returns the skip-case archive from 6.3 (searchable debt index works)
