# Tasks

## 1. Copy helper

- [ ] 1.1 Add `copyClaudeIthyOpsxCommandsToAgents(projectRoot: string, opts: { dryRun?: boolean }): Promise<{ copied: string[], skipped: Array<{ path: string, reason: string }> }>` to `server/skill-renderer/migrate-agy.ts`.
      Reads `<projectRoot>/.claude/commands/ithy-opsx/*.md`. For each file, if
      `<projectRoot>/.agents/workflows/ithy-opsx/<same-basename>` does NOT exist,
      COPY it there (creating parent dirs as needed). If target exists, add to
      `skipped[]` with reason `"target exists"`. Does NOT modify or delete the
      source `.claude/commands/ithy-opsx/` files. Idempotent, dryRun-aware.
- [ ] 1.2 Extend `InstallResult.migrations[]` entry shape in
      `server/skill-renderer/types.ts` with optional `kind?: "move" | "copy"`.
      Default to `"move"` for legacy consumers (the existing legacy-dir
      migration remains labeled implicitly as move via absence).
- [ ] 1.3 Wire the copy helper into `installSkills` in
      `server/skill-renderer/index.ts`: when antigravity is selected, invoke
      the copy helper AFTER the existing legacy-dir migration but BEFORE the
      render loop (so a fresh renderer write at the same path still wins
      over an already-copied target — though in practice the paths do not
      collide because renderer writes `<ns>/<cmd>.md` from source and copy
      writes `<ns>/<same-basename>` from `.claude/`, and both live at the
      same target directory, so `target exists` skip may fire in either
      order). Push a second `migrations[]` entry with `kind: "copy"`.

## 2. Tests

- [ ] 2.1 Unit test — copy: seed `.claude/commands/ithy-opsx/{dispatch,merge}.md`,
      run helper, assert both files copied to `.agents/workflows/ithy-opsx/`
      AND `.claude/commands/ithy-opsx/` sources are unmodified.
- [ ] 2.2 Unit test — skip on target conflict: seed both source and target
      for the same basename, assert copy is skipped, target unchanged.
- [ ] 2.3 Unit test — idempotent: second call finds all targets already
      present, returns empty `copied[]`.
- [ ] 2.4 Unit test — no-op when `.claude/commands/ithy-opsx/` missing.
- [ ] 2.5 Unit test — dry-run reports plan without touching disk.
- [ ] 2.6 installSkills e2e: seed `.claude/commands/ithy-opsx/dispatch.md`,
      run installSkills with antigravity selected, assert:
      (a) file copied to `.agents/workflows/ithy-opsx/dispatch.md`,
      (b) source `.claude/commands/ithy-opsx/dispatch.md` unchanged,
      (c) `result.migrations` has TWO entries: the existing legacy-dir
      migration + the new copy-from-claude migration with `kind: "copy"`.
- [ ] 2.7 installSkills e2e — copy does not run when antigravity is NOT
      selected (verify `.claude/` files untouched, no copy migration entry).

## 3. Verification

- [ ] 3.1 `npm run openspec -- validate copy-claude-ithy-opsx-into-agents-workflows-for-agy --strict` — passes.
- [ ] 3.2 `npm run typecheck` — clean.
- [ ] 3.3 `npm test` — all pass; new tests green.
- [ ] 3.4 Manual smoke (deferred to user): re-run installSkills / init on
      test-proj2 with agy → confirm `.agents/workflows/ithy-opsx/` now
      contains the ithy-opsx skills that were only at `.claude/commands/ithy-opsx/`
      before, AND `.claude/` is left intact.

## 4. Docs

- [ ] 4.1 Write outcome.md capturing: what got copied, whether COPY
      semantics avoided any surprises vs MOVE, and any final cleanup
      follow-ups (e.g., "eventually delete .claude/commands/ithy-opsx/
      entirely for agy-only projects — but not in this change").
