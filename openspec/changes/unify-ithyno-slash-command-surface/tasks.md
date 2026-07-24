# Tasks

## 1. Rename ithyno's `/opsx:*` additions to `/ithy-opsx:*`

- [ ] 1.1 `git mv .claude/commands/opsx/answer.md .claude/commands/ithy-opsx/answer.md` — preserve git history.
- [ ] 1.2 `git mv .claude/commands/opsx/escalate.md .claude/commands/ithy-opsx/escalate.md`.
- [ ] 1.3 `git mv .claude/commands/opsx/revert.md .claude/commands/ithy-opsx/revert.md`.
- [ ] 1.4 `git mv .claude/skills/opsx-revert .claude/skills/ithy-opsx-revert` — preserve history for SKILL.md and any assets under it.
- [ ] 1.5 In each of the 3 renamed command files, update the frontmatter `name:` field (`"OPSX: Answer"` → `"ITHY-OPSX: Answer"` etc.) and update any in-body references to the command's own new slash path.
- [ ] 1.6 In `.claude/skills/ithy-opsx-revert/SKILL.md`, update the frontmatter `name:` (`opsx-revert` → `ithy-opsx-revert`), the `description:` if it names `opsx-revert`, and any in-body references from `/opsx:revert` / `opsx-revert` to the new `ithy-opsx` forms.

## 2. Delete shadow duplicates

- [ ] 2.1 `git rm .claude/commands/opsx/apply.md` — upstream openspec supplies this via `openspec init`.
- [ ] 2.2 `git rm .claude/commands/opsx/archive.md`.
- [ ] 2.3 `git rm .claude/commands/opsx/explore.md`.
- [ ] 2.4 `git rm .claude/commands/opsx/propose.md`.
- [ ] 2.5 `git rm .claude/commands/opsx/sync.md`.
- [ ] 2.6 Verify `.claude/commands/opsx/` is now empty and remove the directory (`git rm -r` if empty).

## 3. Update internal references (grep-driven)

- [ ] 3.1 In `.claude/commands/ithy-opsx/dispatch.md`, replace every `/opsx:escalate` with `/ithy-opsx:escalate` (the escalation ladder references).
- [ ] 3.2 In `openspec/specs/dashboard/spec.md`, replace every `/opsx:revert` with `/ithy-opsx:revert` (currently ~5 refs in the "Revert Workflow" requirement + scenarios).
- [ ] 3.3 In `docs/2026-07-07-phase-3-through-6-decomposition.md`, replace refs.
- [ ] 3.4 In `docs/2026-07-11-manager-usage-and-agents-migration.md`, replace refs.
- [ ] 3.5 Grep the tree post-edit — `grep -rn "/opsx:answer\|/opsx:escalate\|/opsx:revert\|opsx-revert" --exclude-dir=archive --exclude-dir=.worktrees --exclude-dir=node_modules --exclude-dir=.git` returns zero non-comment hits. Any surviving reference must be explicitly kept (with a comment naming why) or migrated.

## 4. Distribute the bundle

- [ ] 4.1 Root `package.json` — add `".claude/commands/ithy-opsx"` and `".claude/skills/ithy-opsx-*/**"` to the `files` array. Do NOT include `.claude/commands/opsx` (it's empty of ithyno content after this change).
- [ ] 4.2 `electron/package.json` — extend `build.extraResources` with `{ from: "../.claude/commands/ithy-opsx", to: "app/.claude/commands/ithy-opsx" }` and `{ from: "../.claude/skills", to: "app/.claude/skills", filter: ["ithy-opsx-*/**"] }`.
- [ ] 4.3 Verify with `npm pack --dry-run` that all 11 command files (8 existing + 3 migrated) and 6 skill dirs (5 existing + 1 migrated) are present.

## 5. Cross-platform installer core

- [ ] 5.1 Create `server/install-skills.ts` with:
  - Types: `ManifestEntry`, `InstallManifest`, `InstallReport`, `UninstallReport`, `IthyOpsxDoctor`.
  - `resolveBundledSkillsRoot(): string` — precedence: env override `ITHYNO_BUNDLED_SKILLS` → packaged `process.resourcesPath/app/.claude` → walk up from module dir looking for `package.json` + `.claude/`.
  - `resolveUserClaudeRoot(): string` — `path.join(os.homedir(), ".claude")`.
  - `resolveManifestPath(): string` — `~/.claude/.ithyno-install-manifest.json`.
- [ ] 5.2 Bundle enumeration: `listBundledFiles(bundleRoot)` walks `commands/ithy-opsx/**` and each `skills/ithy-opsx-*/**`. Returns POSIX-form relative paths, sorted. Confirm the renamed `revert.md` / `answer.md` / `escalate.md` / `ithy-opsx-revert/` are picked up naturally.
- [ ] 5.3 sha256 helpers: `sha256Buffer`, `readSha256`.
- [ ] 5.4 Manifest I/O: `readManifest()`, `writeManifestAtomic(m)` (write-to-tmp + rename).
- [ ] 5.5 `installIthyOpsxSkills({ force?: boolean })` — per-file action logic:
  - Absent → COPY + record.
  - Present as file, matches src hash → record (no I/O).
  - Present, matches manifest sha → OVERWRITE.
  - Present, mismatches manifest sha → SKIP + WARN + record `status: "user-modified"`.
  - Present but wrong type (dir vs file) → SKIP + WARN + record `status: "conflict"`.
- [ ] 5.6 Fast-path: same-version manifest + all-files-present → early return no-op.
- [ ] 5.7 Version-down cleanup: files in old manifest but not in current bundle are removed.
- [ ] 5.8 `uninstallIthyOpsxSkills()` — reads manifest, deletes each listed file, removes empty ithy-opsx directories, deletes manifest.
- [ ] 5.9 `checkIthyOpsxInstall()` — doctor snapshot: `installed` (manifest exists AND every bundled file has target); `installedVersion`; `bundledVersion`; `commandCount`; `skillCount`; `userModifiedFiles`; `installError`.
- [ ] 5.10 Cross-platform: `os.homedir()` for user root; `path.join` throughout for native separator; POSIX-form only in manifest keys; no `chmod` calls; use `copyFile` / `mkdir` from `node:fs/promises`.

## 6. Installer tests

- [ ] 6.1 `server/install-skills.test.ts` — 12 tests minimum covering: fresh install, idempotent re-run, resolveBundledSkillsRoot env override, resolveUserClaudeRoot from HOME/USERPROFILE, version-bump overwrite of unmodified files, user-modification preservation, cleanup of files dropped from newer bundle, uninstall + idempotent uninstall, uninstall preserves unrelated files under ~/.claude, checkIthyOpsxInstall installed/not-installed cases.
- [ ] 6.2 Tests use `ITHYNO_BUNDLED_SKILLS` env override + `HOME` / `USERPROFILE` override to run against a synthetic bundle in a tmp dir.

## 7. Server startup wiring

- [ ] 7.1 In `server/index.ts`, before `fastify.listen`, invoke `installIthyOpsxSkills()`. Errors logged, non-fatal.
- [ ] 7.2 Single-line summary log per outcome (`copied N new + updated M`, `up to date (version X)`, `N user-modified preserved`).
- [ ] 7.3 ERROR-level log on failure, startup continues.

## 8. HTTP endpoints

- [ ] 8.1 `POST /api/doctor/install/ithy-opsx { force?: boolean }` — session-token gated. Runs `installIthyOpsxSkills({ force })`. Returns InstallReport JSON. On success, broadcasts `doctor-updated` WS event.
- [ ] 8.2 `POST /api/doctor/uninstall/ithy-opsx` — session-token gated. Runs `uninstallIthyOpsxSkills()`. Returns UninstallReport JSON. Broadcasts `doctor-updated`.

## 9. Doctor extension

- [ ] 9.1 Extend `DoctorReport` in `server/doctor.ts` with `ithyOpsx: IthyOpsxDoctor`. Import type from `install-skills.ts`.
- [ ] 9.2 `runDoctor()` calls `checkIthyOpsxInstall()` in parallel with existing checks.
- [ ] 9.3 `readyForManager` semantics unchanged.
- [ ] 9.4 Mirror the `IthyOpsxDoctor` type in `web/src/types.ts` and add `ithyOpsx` field to the client `DoctorReport`.
- [ ] 9.5 Update existing test fixtures that construct `DoctorReport` inline (`server/init.test.ts`, `web/src/components/InitDialog.test.ts`) to include the new field.

## 10. Settings UI

- [ ] 10.1 Add `installIthyOpsx(force)` and `uninstallIthyOpsx()` functions in `web/src/api.ts` that POST to the new endpoints.
- [ ] 10.2 Add `IthyOpsxRow` component into `web/src/pages/Settings.tsx`'s Prerequisites section, rendering install version + counts + status icon.
- [ ] 10.3 When `installed === false` → `[Install]` button; when `installed === true` → `[Reinstall]` + `[Uninstall]` (opens a confirm modal listing the affected file count).
- [ ] 10.4 When `userModifiedFiles.length > 0` → ⚠ badge with tooltip listing the paths.
- [ ] 10.5 After install/uninstall completes, refresh the doctor report via `loadDoctorReport()`.

## 11. CLI subcommands

- [ ] 11.1 Add `bin/_install-skills-runner.ts` — thin script running `installIthyOpsxSkills` / `uninstallIthyOpsxSkills` based on argv, prints compact summary, exits 0 on success / 1 on error.
- [ ] 11.2 Add `install-skills [--force]` and `uninstall-skills` subcommands to `bin/ithyno.js` (via commander), delegating to the runner via `tsx`.

## 12. Verification

- [ ] 12.1 `npm run openspec -- validate unify-ithyno-slash-command-surface --strict` passes.
- [ ] 12.2 `npm test` passes (accepting the known-unrelated `scripts/build-icons.test.mjs` failure on Node 25.8).
- [ ] 12.3 `npm run typecheck` passes.
- [ ] 12.4 `npm run build` passes.
- [ ] 12.5 `npm pack --dry-run` grep confirms all 11 command files + 6 skill dirs are present.
- [ ] 12.6 Manual dev-mode smoke: `rm -rf /tmp/ithy-opsx-clean-home && HOME=/tmp/ithy-opsx-clean-home npx tsx bin/_install-skills-runner.ts install` → `ls /tmp/ithy-opsx-clean-home/.claude/commands/ithy-opsx` shows 11 files → `ls /tmp/ithy-opsx-clean-home/.claude/skills` shows 6 ithy-opsx-* dirs including `ithy-opsx-revert`.
- [ ] 12.7 Manual: hand-edit one installed file, re-run install → log shows `skipped (user-modified)`, file preserved, manifest records `status: "user-modified"`.
- [ ] 12.8 Manual: `ithyno uninstall-skills` → all 17 items + manifest removed, other files under `~/.claude/` untouched.
- [ ] 12.9 Grep post-edit — `grep -rn "/opsx:answer\|/opsx:escalate\|/opsx:revert\|opsx-revert" --exclude-dir=archive --exclude-dir=.worktrees --exclude-dir=node_modules --exclude-dir=.git` returns zero hits (or only intentionally-preserved refs, each documented in the outcome).
- [ ] 12.10 Manual Pattern B verify: launch ithyno on the boilerplate project → Import → `/ithy-opsx:import` resolves (no "Unknown command") → sub-agent spawns → GENERATED.md written.
- [ ] 12.11 Write `openspec/changes/unify-ithyno-slash-command-surface/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups).
