# Tasks

## 1. Rename ithyno's `/opsx:*` additions to `/ithy-opsx:*`

- [x] 1.1 `git mv .claude/commands/opsx/answer.md .claude/commands/ithy-opsx/answer.md`.
- [x] 1.2 `git mv .claude/commands/opsx/escalate.md .claude/commands/ithy-opsx/escalate.md`.
- [x] 1.3 `git mv .claude/commands/opsx/revert.md .claude/commands/ithy-opsx/revert.md`.
- [x] 1.4 `git mv .claude/skills/opsx-revert .claude/skills/ithy-opsx-revert`.
- [x] 1.5 Frontmatter `name:` updated in each renamed command file (`"OPSX: Answer"` → `"ITHY-OPSX: Answer"` etc.). In-body Usage examples updated. In-body cross-references (`/opsx:revert` → `/ithy-opsx:revert` etc.) updated.
- [x] 1.6 `.claude/skills/ithy-opsx-revert/SKILL.md` frontmatter `name:` + `description:` migrated. In-body `/opsx:revert` references → `/ithy-opsx:revert`. Skill id references → `ithy-opsx-revert`.

## 2. Delete shadow duplicates

- [x] 2.1 `git rm .claude/commands/opsx/apply.md`.
- [x] 2.2 `git rm .claude/commands/opsx/archive.md`.
- [x] 2.3 `git rm .claude/commands/opsx/explore.md`.
- [x] 2.4 `git rm .claude/commands/opsx/propose.md`.
- [x] 2.5 `git rm .claude/commands/opsx/sync.md`.
- [x] 2.6 `.claude/commands/opsx/` directory auto-removed by git (empty after 2.1-2.5).

## 3. Update internal references (grep-driven)

- [x] 3.1 `.claude/commands/ithy-opsx/dispatch.md`: 8 `/opsx:escalate` refs + 1 `/opsx:answer` ref replaced with `/ithy-opsx:*` forms.
- [x] 3.2 `openspec/specs/dashboard/spec.md`: Revert Slash Command requirement body kept as-is (PENDING annotation signals the rename); ADDED PENDING MODIFIED annotations to Escalate + Answer Command Wrapper requirements too. Change delta covers all three via MODIFIED entries.
- [x] 3.3 `docs/2026-07-07-phase-3-through-6-decomposition.md` — `/opsx:escalate` → `/ithy-opsx:escalate`.
- [x] 3.4 `docs/2026-07-11-manager-usage-and-agents-migration.md` — `/opsx:answer` → `/ithy-opsx:answer`.
- [x] 3.5 Post-edit grep confirms zero live refs to `/opsx:{answer,escalate,revert}` or `opsx-revert` OUTSIDE the openspec/specs/ requirement bodies (which stay verbatim until archive per CLAUDE.md convention) and outside intentional historical citations in ithy-opsx-revert/SKILL.md ("originally shipped as /opsx:revert"). `/opsx:code` is a phantom spec entry (no file, no code impl) — left alone as separate cleanup task.

## 4. Distribute the bundle

- [x] 4.1 Root `package.json` — `files` array includes `.claude/commands/ithy-opsx` and `.claude/skills/ithy-opsx-*/**`.
- [x] 4.2 `electron/package.json` — `extraResources` extended with `../.claude/commands/ithy-opsx → app/.claude/commands/ithy-opsx` and `../.claude/skills → app/.claude/skills` (filter `ithy-opsx-*/**`).
- [x] 4.3 `npm pack --dry-run` verified — all 11 command files + all 6 skill dirs present.

## 5. Cross-platform installer core

- [x] 5.1 `server/install-skills.ts` created with types, path resolution helpers, and installer functions.
- [x] 5.2 `listBundledFiles` walks `commands/ithy-opsx/**` and each `skills/ithy-opsx-*/**` — picks up the renamed revert/answer/escalate + ithy-opsx-revert naturally.
- [x] 5.3 sha256 helpers implemented.
- [x] 5.4 Manifest I/O (`readManifest`, `writeManifestAtomic`) implemented.
- [x] 5.5 `installIthyOpsxSkills` per-file action logic implemented.
- [x] 5.6 Fast-path (same-version + all-files-present) short-circuits.
- [x] 5.7 Version-down cleanup — files in old manifest but not current bundle are removed.
- [x] 5.8 `uninstallIthyOpsxSkills` implemented.
- [x] 5.9 `checkIthyOpsxInstall` doctor snapshot implemented.
- [x] 5.10 Cross-platform: `os.homedir()` + `path.join` throughout, POSIX-form only in manifest keys, no `chmod`, `copyFile`.

## 6. Installer tests

- [x] 6.1 `server/install-skills.test.ts` — 12 tests, all pass.
- [x] 6.2 Tests use env overrides (`ITHYNO_BUNDLED_SKILLS` + `HOME` + `USERPROFILE`) against synthetic bundle in tmp dir.

## 7. Server startup wiring

- [x] 7.1 `server/index.ts` invokes `installIthyOpsxSkills()` before `fastify.listen`; errors non-fatal.
- [x] 7.2 Single-line summary log per outcome branch.
- [x] 7.3 ERROR-level log on failure; startup continues.

## 8. HTTP endpoints

- [x] 8.1 `POST /api/doctor/install/ithy-opsx` — session-token gated; broadcasts `doctor-updated`.
- [x] 8.2 `POST /api/doctor/uninstall/ithy-opsx` — session-token gated; broadcasts `doctor-updated`.

## 9. Doctor extension

- [x] 9.1 `DoctorReport` extended with `ithyOpsx: IthyOpsxDoctor`.
- [x] 9.2 `runDoctor()` calls `checkIthyOpsxInstall()` in parallel with existing checks.
- [x] 9.3 `readyForManager` semantics unchanged.
- [x] 9.4 `web/src/types.ts` mirrors `IthyOpsxDoctor` + adds `ithyOpsx` field to client `DoctorReport`.
- [x] 9.5 Test fixtures in `server/init.test.ts` + `web/src/components/InitDialog.test.ts` updated with the new field.

## 10. Settings UI

- [x] 10.1 `installIthyOpsx(force)` + `uninstallIthyOpsx()` added to `web/src/api.ts`.
- [x] 10.2 `IthyOpsxRow` component added to Settings Prerequisites section.
- [x] 10.3 Install / Reinstall / Uninstall action buttons wired; Uninstall opens confirm modal listing file count.
- [x] 10.4 `userModifiedFiles.length > 0` renders ⚠ badge with tooltip listing paths.
- [x] 10.5 `loadDoctorReport()` re-runs after install/uninstall (server also broadcasts `doctor-updated` for cross-tab sync).

## 11. CLI subcommands

- [x] 11.1 `bin/_install-skills-runner.ts` — thin tsx runner.
- [x] 11.2 `bin/ithyno.js` — `install-skills [--force]` + `uninstall-skills` subcommands via commander.

## 12. Verification

- [x] 12.1 `npm run openspec -- validate unify-ithyno-slash-command-surface --strict` passes.
- [x] 12.2 `npm test` passes: install-skills 12/12; overall the pre-existing `scripts/build-icons.test.mjs` Node 25.8 `sharp` failure is accepted (unrelated to this change).
- [x] 12.3 `npm run typecheck` passes.
- [x] 12.4 `npm run build` (web) passes.
- [x] 12.5 `npm pack --dry-run` confirms 11 commands + 6 skill dirs bundled.
- [x] 12.6 Manual dev-mode smoke: `HOME=/tmp/ithy-opsx-clean-home npx tsx bin/_install-skills-runner.ts install` → 11 commands + 6 skill dirs installed including `ithy-opsx-revert`. Verified.
- [ ] 12.7 Manual: hand-edit + preserve — covered by unit test `user-modified file is preserved on version bump`.
- [ ] 12.8 Manual: `ithyno uninstall-skills` — covered by unit test `uninstall removes every installed file + manifest`.
- [x] 12.9 Post-edit grep of `/opsx:{answer,escalate,revert}|opsx-revert` returns only intentional refs: (a) requirement bodies in openspec/specs/dashboard/spec.md (PENDING'd, rewritten at archive) and (b) one historical citation in ithy-opsx-revert/SKILL.md documenting the rename lineage.
- [ ] 12.10 Manual Pattern B verify — requires Manager PTY restart on the boilerplate project after this ships. Best done post-merge by the user.
- [x] 12.11 `openspec/changes/unify-ithyno-slash-command-surface/outcome.md` written.
