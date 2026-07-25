# Tasks

## 1. Templates — add ithy-opsx as scaffold sources

- [ ] 1.1 Copy every file under `.claude/commands/ithy-opsx/` into `templates/.claude/commands/ithy-opsx/`. 11 files (`answer.md`, `apply.md`, `archive.md`, `dispatch.md`, `dispatch-multi.md`, `escalate.md`, `import.md`, `merge.md`, `review.md`, `revert.md`, `verify.md`).
- [ ] 1.2 Copy every `.claude/skills/ithy-opsx-*/` directory into `templates/.claude/skills/`. 6 dirs (`ithy-opsx-apply`, `ithy-opsx-archive`, `ithy-opsx-dispatch-multi`, `ithy-opsx-import`, `ithy-opsx-merge`, `ithy-opsx-revert`).
- [x] 1.3 Confirm `bin/init.js`'s `walkTemplates` picks the new files up without code changes. The existing walk is generic; no edit expected. Add a comment in `bin/init.js` naming ithy-opsx as one of the scaffold targets so a future reader knows why those templates exist. (Comment landed in the header block near `PACKAGE_ROOT`; naming both `openspec-flow` and `ithy-opsx-*` for symmetry.)

## 2. Drift guard

- [ ] 2.1 In `server/init.test.ts`, add a `describe("ithy-opsx template drift guard")` block. For every file under `.claude/commands/ithy-opsx/` and every file under each `.claude/skills/ithy-opsx-*/`, assert a byte-identical file exists at the matching `templates/` path.
- [ ] 2.2 Model on the existing `openspec-flow` guard in `server/init.test.ts` (search for `openspec-flow` there). Same two-file compare pattern; iterate.
- [ ] 2.3 Failure message must name the specific pair that diverged so the reader can fix it in one grep.

## 3. Delete the user-global install machinery

- [ ] 3.1 Delete `server/install-skills.ts` and `server/install-skills.test.ts`.
- [ ] 3.2 In `server/index.ts`, remove the `import { installIthyOpsxSkills, uninstallIthyOpsxSkills } from "./install-skills.js"` line, the `installIthyOpsxSkills()` block before `fastify.listen`, and both endpoints (`POST /api/doctor/install/ithy-opsx`, `POST /api/doctor/uninstall/ithy-opsx`).
- [ ] 3.3 In `server/doctor.ts`, remove the `checkIthyOpsxInstall` import, the `ithyOpsx: IthyOpsxDoctor` field from `DoctorReport`, and the parallel `checkIthyOpsxInstall()` call in `runDoctor()`.
- [ ] 3.4 In `web/src/types.ts`, remove the `IthyOpsxDoctor` type and the `ithyOpsx` field from client `DoctorReport`.
- [ ] 3.5 In `server/init.test.ts` and `web/src/components/InitDialog.test.ts`, remove the `ithyOpsx: { … }` block from the test `DoctorReport` fixtures.
- [ ] 3.6 In `web/src/api.ts`, remove `installIthyOpsx` and `uninstallIthyOpsx`.
- [ ] 3.7 In `web/src/pages/Settings.tsx`, remove `IthyOpsxRow` (the component, the imports, and the render site), and drop the two names from the `../api` import.
- [ ] 3.8 Delete `bin/_install-skills-runner.ts`. In `bin/ithyno.js`, remove the `install-skills` and `uninstall-skills` subcommands and the `runSkillsSubcommand` helper.
- [ ] 3.9 In root `package.json`, remove `.claude/commands/ithy-opsx` and `.claude/skills/ithy-opsx-*/**` from the `files` array. In `electron/package.json`, remove the two `../.claude/...` entries from `build.extraResources`. Both continue to ship ithy-opsx to bundled artefacts via `templates/`, which is already listed.

## 4. Unify spec-delta cleanup

- [ ] 4.1 In `openspec/changes/unify-ithyno-slash-command-surface/specs/dashboard/spec.md`, delete these six requirements (the change is committed but not archived, so their proposed status is edited in-place, not annotated on a landed spec):
  - `Ithyno's slash-command surface is bundled in distributed artifacts`
  - `Ithyno's slash-command surface auto-installs to user home on startup`
  - `Ithyno's slash-command surface is uninstallable`
  - `Doctor reports ithy-opsx install state`
  - `Settings shows ithy-opsx install controls`
  - `Ithyno CLI exposes install / uninstall subcommands`
- [ ] 4.2 In `unify`'s `tasks.md` and `outcome.md`, delete or strike the sections describing the install / uninstall / Doctor / Settings / CLI work, and add an outcome-note pointing at this change as the corrected distribution.
- [ ] 4.3 `npm run openspec -- validate unify-ithyno-slash-command-surface --strict` still passes.

## 5. Clean up copies already on the dev machine

- [ ] 5.1 `rm -rf ~/.claude/commands/ithy-opsx` (the installer wrote 11 files there).
- [ ] 5.2 `rm -rf ~/.claude/skills/ithy-opsx-*` (6 dirs).
- [ ] 5.3 `rm -f ~/.claude/.ithyno-install-manifest.json`.
- [ ] 5.4 Confirm no other files under `~/.claude/` reference or depend on the deleted paths. This is a dev-machine one-shot; not a general uninstaller.

## 6. Verification

- [ ] 6.1 `npm run openspec -- validate distribute-ithy-opsx-via-init-templates --strict` passes.
- [ ] 6.2 `npm test` passes. The drift-guard added in 2.1 runs and passes.
- [ ] 6.3 `npm run typecheck` passes.
- [ ] 6.4 `npm run build` passes (the removed `IthyOpsxRow` and the removed `installIthyOpsx` / `uninstallIthyOpsx` mean no dangling imports).
- [ ] 6.5 `npm pack --dry-run | grep -E 'ithy-opsx'` shows entries ONLY under `templates/.claude/…`, never under `.claude/…`.
- [ ] 6.6 Manual (fresh target): run `ithyno init` on a tmp dir → `find <tmp>/.claude -type f` shows both the openspec-init output and the ithy-opsx scaffold in one tree.
- [ ] 6.7 Manual (dev repo): `git status` after `npm test` is clean (drift guard passes without side effects).
- [ ] 6.8 Manual: start the ithyno server, watch its stdout — no `[install-skills]` log line appears. The startup wire is truly gone.
- [ ] 6.9 Write `openspec/changes/distribute-ithy-opsx-via-init-templates/outcome.md`.

## 7. Deferred — three phase branches merge sequencing

- [ ] 7.1 The three phase branches (`agent/dynamic-phase-lanes-from-agents-roles`, `agent/annotate-cards-with-worker-job-state`, `agent/expose-manager-activity-per-change`) were cut from `feature/add-phase-lane-view-toggle`, which was cut from a develop state that had `unify`'s install machinery in it. So each phase branch contains the machinery this change is removing. When they merge back to develop after this change lands, git will re-add `server/install-skills.ts` etc. from the phase branches' side unless the merge tells it otherwise.
- [ ] 7.2 Either (a) merge this change into `feature/add-phase-lane-view-toggle` first, then merge that into each phase branch, so all four branches converge on the same base — or (b) resolve the re-add at each phase branch's merge to `develop` by explicitly dropping the install files. Decide at merge time; do not merge blindly.
