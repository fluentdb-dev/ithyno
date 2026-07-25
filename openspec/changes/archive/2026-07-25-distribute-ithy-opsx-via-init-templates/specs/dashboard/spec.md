## ADDED Requirements

### Requirement: Ithyno Init scaffolds `/ithy-opsx:*` into the target project

Ithyno's Init flow SHALL scaffold every ithyno-authored `/ithy-opsx:*` command file and every backing `ithy-opsx-*` skill directory into the target project's `.claude/` tree, alongside the upstream `/opsx:*` output that `openspec init` produces.

The scaffold SHALL be delivered via the existing `templates/` mechanism used for `agents.yaml.tmpl`, `CLAUDE.md`, and `templates/.claude/skills/openspec-flow/` — that is, files placed under `templates/.claude/commands/ithy-opsx/` and `templates/.claude/skills/ithy-opsx-*/` in the ithyno distribution. `bin/init.js`'s existing `walkTemplates` picks them up without dedicated copy logic.

Distribution SHALL NOT include any user-global install step. The ithyno server SHALL NOT write into `~/.claude/` on startup, and no `/api/doctor/install/ithy-opsx` / `/api/doctor/uninstall/ithy-opsx` endpoints SHALL exist. The ithyno CLI SHALL NOT expose `install-skills` / `uninstall-skills` subcommands. The Doctor report SHALL NOT include an `ithyOpsx` field. Settings › Prerequisites SHALL NOT render an ithy-opsx install row.

The ithyno-ui repo itself is the development environment and does NOT run Init on itself; its `.claude/commands/ithy-opsx/` and `.claude/skills/ithy-opsx-*/` are the dev-copy that the templates mirror. A drift-guard test enforces byte-identity between the dev-copy and the template so an edit to one that misses the other fails CI, not review.

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

### Requirement: Drift-guard test keeps the dev copy and the template in sync

The Vitest suite SHALL include a drift guard that iterates every file under `.claude/commands/ithy-opsx/` and every file under each `.claude/skills/ithy-opsx-*/` in the dev repo, and asserts a byte-identical file exists at the matching `templates/.claude/…` path. The guard SHALL name the specific pair that diverged in its failure message so a reader can fix it in one grep. This mirrors the existing `templates/.claude/skills/openspec-flow/` drift guard in `server/init.test.ts`.

The guard SHALL run as part of `npm test`, so a PR that edits the dev copy without updating the template (or vice versa) fails before review, not after.

#### Scenario: Dev-copy edit without template update fails the guard
- **GIVEN** a developer edits `.claude/commands/ithy-opsx/dispatch.md` in the dev repo
- **AND** does NOT make the same edit to `templates/.claude/commands/ithy-opsx/dispatch.md`
- **WHEN** `npm test` runs
- **THEN** the drift guard fails with a message naming `dispatch.md` as the diverged pair

#### Scenario: Template edit without dev-copy update fails the guard
- **GIVEN** a developer edits `templates/.claude/skills/ithy-opsx-import/SKILL.md`
- **AND** does NOT make the same edit to `.claude/skills/ithy-opsx-import/SKILL.md`
- **WHEN** `npm test` runs
- **THEN** the drift guard fails with a message naming `ithy-opsx-import/SKILL.md` as the diverged pair

#### Scenario: Byte-identical trees pass silently
- **GIVEN** every dev-copy file has a byte-identical counterpart under `templates/.claude/…`
- **WHEN** `npm test` runs
- **THEN** the drift guard passes without output beyond the standard test summary
- **AND** the working tree is unchanged (the guard is read-only)
