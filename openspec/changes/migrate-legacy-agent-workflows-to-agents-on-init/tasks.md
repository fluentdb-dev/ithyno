# Tasks

## 1. Migration helper

- [ ] 1.1 Create `server/skill-renderer/migrate-agy.ts` exporting
      `migrateLegacyAntigravityDir(projectRoot: string, opts: { dryRun?: boolean }): Promise<{ moved: string[], skipped: Array<{ path: string, reason: string }> }>`.
      Reads `<projectRoot>/.agent/workflows/`. For each `*.md` file, if
      `<projectRoot>/.agents/workflows/<same-name>` does NOT exist, move
      (rename) it there (creating parent dirs as needed). If target
      exists, add to `skipped[]` with reason `"target exists"`.
      After moving, `rmdir` empty `.agent/workflows/` and its parent
      `.agent/` if empty. Returns the summary. Idempotent — a second
      call finds nothing and returns `{ moved: [], skipped: [] }`.
- [ ] 1.2 Extend `InstallResult` in `server/skill-renderer/types.ts`
      with `migrations: Array<{ cli: CliId, moved: string[], skipped: Array<{ path: string, reason: string }> }>`.
- [ ] 1.3 Wire the migration into `installSkills` in
      `server/skill-renderer/index.ts`: when `selectedClis.includes("antigravity")`,
      invoke the helper ONCE before the render loop and push the result
      into `result.migrations`. Migration honors `opts.dryRun`.

## 2. Tests

- [ ] 2.1 Unit tests for `migrateLegacyAntigravityDir`: (a) moves
      files, (b) skips on target conflict, (c) idempotent, (d) no-op
      when `.agent/` missing, (e) dry-run reports plan without side
      effects, (f) cleans up empty parent dirs.
- [ ] 2.2 installSkills e2e: after seeding a fixture project with
      `.agent/workflows/opsx-propose.md` and running installSkills for
      `antigravity`, assert the file ends up at `.agents/workflows/opsx-propose.md`
      AND `result.migrations` reports it.
- [ ] 2.3 installSkills e2e — conflict case: seed both
      `.agent/workflows/opsx-apply.md` (stale) AND `.agents/workflows/opsx-apply.md`
      (new). Assert the stale one is left in place and reported under
      `skipped[]`, and the new one is unmodified.

## 3. Verification

- [ ] 3.1 `npm run openspec -- validate migrate-legacy-agent-workflows-to-agents-on-init --strict` — passes.
- [ ] 3.2 `npm run typecheck` — clean.
- [ ] 3.3 `npm test` — all pass; new migration tests green.
- [ ] 3.4 Manual smoke (deferred to user): re-run `openspec init` on
      test-proj2 with agy → confirm any residual `.agent/workflows/`
      contents have moved into `.agents/workflows/` and `.agent/` is
      cleaned up.

## 4. Docs

- [ ] 4.1 Write `openspec/changes/migrate-legacy-agent-workflows-to-agents-on-init/outcome.md`
      capturing what happened during the port, the conflict-handling
      choice, and follow-ups (e.g., report upstream to openspec so
      their adapter can be corrected).
