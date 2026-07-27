## MODIFIED Requirements

### Requirement: Ithyno Init scaffolds `/ithy-opsx:*` into the target project

Ithyno's Init flow SHALL scaffold every ithyno-authored `/ithy-opsx:*` command file and every backing `ithy-opsx-*` skill directory into the target project's `.claude/` tree, alongside the upstream `/opsx:*` output that `openspec init` produces.

The scaffold SHALL be delivered via the existing `templates/` mechanism used for `agents.yaml.tmpl`, `CLAUDE.md`, and `templates/.claude/skills/openspec-flow/` — that is, files placed under `templates/.claude/commands/ithy-opsx/` and `templates/.claude/skills/ithy-opsx-*/` in the ithyno distribution. `bin/init.js`'s existing `walkTemplates` picks them up without dedicated copy logic.

Distribution SHALL NOT include any user-global install step. The ithyno server SHALL NOT write into `~/.claude/` on startup, and no `/api/doctor/install/ithy-opsx` / `/api/doctor/uninstall/ithy-opsx` endpoints SHALL exist. The ithyno CLI SHALL NOT expose `install-skills` / `uninstall-skills` subcommands. The Doctor report SHALL NOT include an `ithyOpsx` field. Settings › Prerequisites SHALL NOT render an ithy-opsx install row.

The ithyno-ui repo itself is the development environment and does NOT run Init on itself; its `.claude/commands/ithy-opsx/` and `.claude/skills/ithy-opsx-*/` are the dev-copy that the templates mirror. A drift-guard test enforces byte-identity between the dev-copy and the template so an edit to one that misses the other fails CI, not review.

The Vitest suite SHALL additionally include two smoke assertions guarding the invariants above end-to-end (added by `add-init-scaffold-smoke-test`):

- **Scaffold reachability**: `runInit()` invoked against a `mkdtemp()` target with `autoGitInit: true` SHALL leave every file present under the repo's `.claude/commands/ithy-opsx/` and every file under each `.claude/skills/ithy-opsx-*/` present at the matching `<target>/.claude/…` path, byte-identical. This is orthogonal to the drift guard: drift compares dev-copy to `templates/`; scaffold reachability compares dev-copy to what actually lands post-Init in a target. An edit to `bin/init.js` or `walkTemplates` that stops copying the ithy-opsx trees fails this test even if the drift guard still passes.
- **Package shape**: `npm pack --dry-run --json` SHALL be parsed and every ithy-opsx entry in the tarball's file list SHALL live under `templates/.claude/…`. No entry SHALL match `^\.claude/commands/ithy-opsx` or `^\.claude/skills/ithy-opsx-`. A future edit that re-adds bare `.claude/…` entries to `package.json` `files` fails this test.

The project SHALL additionally ship a scaffolded-target skill-e2e harness (added by `add-skill-e2e-harness`, reshaped by `revert-skill-e2e-live-mode`) that provides **structural coverage** of every `/ithy-opsx:*` skill in a `mkdtemp()` scaffolded target. The harness SHALL be invoked via `npm run e2e:skills`, SHALL be gated behind `E2E=1` (not part of `npm test`), and SHALL exit non-zero if any covered skill's command file fails to resolve, if fixture setup fails, or if the harness's ithyno server fails to boot against the scaffolded target on port 4321. The harness SHALL cover — at minimum — every skill named in Phase D of `docs/ideas/2026-07-26-comprehensive-skill-test-plan.md`: `apply`, `review`, `verify`, `merge`, `archive`, `revert`, `import`, `escalate`, `answer`, `dispatch`, `dispatch-multi`. Coverage SHALL be structural (does the surface scaffold and resolve?) — semantic verification (does each skill actually apply / review / commit / etc?) is manual, per `docs/skill-e2e-manual-verification.md`. Rationale: `claude -p` mode interacts non-deterministically with slash commands that have interactive commit-approval steps (`/ithy-opsx:apply` and `:archive` both hang waiting for user input), producing false positives / negatives that make live-mode automation unreliable; manual verification via the Electron .app or VSCode extension surface is the load-bearing coverage for semantics.

#### Scenario: Fresh target through Init has ithy-opsx alongside opsx
- **GIVEN** a project directory with no `openspec/`, no `.claude/`, no `agents.yaml`
- **WHEN** `POST /api/init` runs on it (with a valid manager choice)
- **THEN** the target ends up with `.claude/commands/opsx/*.md` (from `openspec init`) AND `.claude/commands/ithy-opsx/*.md` (from ithyno template scaffold)
- **AND** the target ends up with `.claude/skills/openspec-flow/`, `.claude/skills/openspec-*/`, AND every `.claude/skills/ithy-opsx-*/` present under `templates/`
- **AND** every scaffolded file appears in the target's `git status` output as untracked (visible, editable, git-tracked once committed)

#### Scenario: A Manager PTY started in a scaffolded target resolves `/ithy-opsx:*`
- **GIVEN** a target project that ran ithyno Init, so its `.claude/commands/ithy-opsx/` exists
- **WHEN** a Claude Code Manager PTY starts with that target as its cwd, and the user types `/ithy-opsx:import` (or any other command in the family)
- **THEN** the command resolves from the target's own `.claude/`, with no dependency on `~/.claude/`
- **AND** the same resolution path serves `/opsx:apply` — the `code` role's prompt — from the target's `.claude/commands/opsx/`

#### Scenario: A non-Init'd project has no `/ithy-opsx:*`
- **GIVEN** a project with `openspec init` output but no ithyno Init
- **WHEN** a Claude Code session opens that project's cwd and the user types `/ithy-opsx:dispatch <id>`
- **THEN** the command does not resolve (Claude Code reports "Unknown command")
- **AND** `/opsx:*` commands still resolve normally, because those came from `openspec init` and are independent of ithyno

#### Scenario: Server startup does not touch `~/.claude/`
- **GIVEN** the ithyno server about to start
- **WHEN** it completes startup and begins accepting HTTP requests
- **THEN** no read or write occurred against `~/.claude/`
- **AND** the server logs contain no `[install-skills]` line

#### Scenario: `GET /api/doctor` has no ithy-opsx field
- **GIVEN** the ithyno server is running
- **WHEN** an authorized client requests `GET /api/doctor`
- **THEN** the response body has no `ithyOpsx` field
- **AND** neither `agents`, `tmux`, `agmsg`, `readyForManager`, nor `checkedAt` are affected

#### Scenario: Scaffold reachability smoke — every ithy-opsx surface file lands in the target
- **GIVEN** a fresh `mkdtemp()` target directory
- **WHEN** `runInit({ targetDir, autoGitInit: true, quiet: true })` completes with `ok: true`
- **THEN** for every file `f` under the repo's `.claude/commands/ithy-opsx/`, `<target>/.claude/commands/ithy-opsx/<f>` exists and is byte-identical to `f`
- **AND** for every skill `s` under the repo's `.claude/skills/ithy-opsx-*/`, `<target>/.claude/skills/<s>/` contains every file from the source skill, byte-identical
- **AND** the test iterates the dev-copy tree rather than hard-coding counts, so adding a new command or skill file in a future change does not require test updates

#### Scenario: Scaffold reachability smoke fails when Init copy path stops picking up ithy-opsx
- **GIVEN** a hypothetical edit to `bin/init.js` that filters `walkTemplates` output to exclude `.claude/skills/ithy-opsx-*` (regression)
- **WHEN** `npm test` runs
- **THEN** the scaffold-reachability test fails and names at least one specific `<target>/.claude/skills/ithy-opsx-*/SKILL.md` path that failed to land
- **AND** the drift-guard test still passes (dev-copy ≡ templates is unchanged), demonstrating the two tests catch distinct regressions

#### Scenario: Package shape smoke — npm pack ships ithy-opsx only via templates
- **GIVEN** the repo at a clean HEAD
- **WHEN** `npm pack --dry-run --json` is run and its `files` array is parsed
- **THEN** every entry whose path contains `ithy-opsx` sits under `templates/.claude/…`
- **AND** no entry matches the pattern `^\.claude/commands/ithy-opsx` or `^\.claude/skills/ithy-opsx-`
- **AND** the test fails loudly if either invariant is violated

#### Scenario: Package shape smoke fails when files re-add bare `.claude/` entry
- **GIVEN** a hypothetical edit to root `package.json` that re-adds `.claude/commands/ithy-opsx` to the `files` array (regression, matching what `distribute-ithy-opsx-via-init-templates` removed)
- **WHEN** `npm test` runs
- **THEN** the package-shape test fails and names the offending tarball entry path
- **AND** the message points the reader at both this scenario and the distribute-ithy-opsx contract so the fix is obvious

#### Scenario: Skill-e2e harness verifies structural resolution of every `/ithy-opsx:*` skill in a scaffolded target
- **GIVEN** the developer invokes `E2E=1 npm run e2e:skills` on a clean HEAD
- **WHEN** the harness creates a `mkdtemp()` scaffolded target via `runInit()` + `openspec init`, seeds each flow's fixture, and boots an ithyno server against it on port 4321
- **THEN** the harness asserts that every skill named in Phase D of the idea-doc (`apply`, `review`, `verify`, `merge`, `archive`, `revert`, `import`, `escalate`, `answer`, `dispatch`, `dispatch-multi`) has its command file resolvable at `.claude/commands/ithy-opsx/<skill>.md` in the scaffolded target
- **AND** the harness exits 0 on all-structural-pass, non-zero with a per-skill pass / fail summary otherwise
- **AND** the harness completes in under 30 seconds wall-clock on a reasonable developer machine

#### Scenario: Skill-e2e harness fails when a scaffolded skill file is missing
- **GIVEN** a hypothetical regression that removes `templates/.claude/commands/ithy-opsx/apply.md` (or breaks `runInit`'s walk of it)
- **WHEN** `E2E=1 npm run e2e:skills` runs
- **THEN** Flow A fails at the `assertIthyOpsxCommandResolves("apply")` step with an error naming the specific missing surface
- **AND** the harness's exit code is non-zero and the per-skill summary shows `apply FAIL` with the reason

#### Scenario: Live semantic verification of `/ithy-opsx:*` skills is documented as a manual procedure
- **GIVEN** a maintainer preparing a release cut
- **WHEN** they consult `docs/skill-e2e-manual-verification.md`
- **THEN** the doc names both an Electron .app path (A) and a VSCode extension path (B) as the two supported test surfaces
- **AND** the doc provides a per-skill checklist (11 skills × prep + type + expect + fail-mode) with a shared reporting template
- **AND** the doc explains why live automation is not attempted: `claude -p` non-determinism + interactive commit-approval traps in `/ithy-opsx:apply` and `:archive`

#### Scenario: Skill-e2e harness is not part of `npm test`
- **GIVEN** a developer runs `npm test` without setting `E2E=1`
- **WHEN** the test suite completes
- **THEN** the skill-e2e harness did NOT run (no server was booted, no `mkdtemp()` target was created)
- **AND** the harness is invoked only when `E2E=1 node scripts/skill-e2e.mjs` (or the equivalent `npm run e2e:skills`) is called explicitly
- **AND** the harness's runtime cost does not creep into the standard PR / CI test budget

#### Scenario: Skill-e2e harness cleans up on success and on failure
- **GIVEN** the harness has created scaffolded targets and spawned an ithyno server
- **WHEN** the harness completes (whether all flows pass, some fail, or the harness itself crashes)
- **THEN** every scaffolded `mkdtemp()` target directory is removed (unless `--keep-tmp` was passed for diagnosis)
- **AND** every spawned ithyno server subprocess is killed
- **AND** no port allocated by the harness remains bound after exit
