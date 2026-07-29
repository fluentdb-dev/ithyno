---
tags: [dashboard, init, ithy-opsx, distribution, templates, scaffold, corrective]
execution: worktree
---

## Why

This is the proposal `unify-ithyno-slash-command-surface` should have
written for its distribution question. That change made two decisions:

1. **Consolidate ithyno's slash-command surface under `/ithy-opsx:*`
   exclusively.** Correct. Kept.
2. **Ship `/ithy-opsx:*` by installing it into `~/.claude/` on every
   ithyno server startup.** Wrong. This proposal supersedes it.

The user-global install model reintroduces the exact problem the
namespace consolidation was there to prevent. Concretely:

- **The dev repo is also a consumer.** `.claude/commands/opsx/*` was
  removed from this repo as "shadow duplicates" — true for target
  projects (they get them from `openspec init`), but ithyno-ui uses
  `/opsx:apply` for its own `code` role and had no other copy. The
  installer created the same class of problem one layer up: it
  scatters copies of ithyno's own files into `~/.claude/`, a location
  ithyno doesn't control, where they immediately begin to drift from
  the dev copy in the repo.
- **The staleness is structural, not incidental.** The installer
  gates on `installedVersion === bundledVersion`, and version doesn't
  move during development. Every edit a developer makes to
  `.claude/commands/ithy-opsx/` is invisible to `~/.claude/`
  indefinitely.
- **The install source is whichever tree last started a server.**
  `resolveBundledSkillsRoot()` walks up from its own module directory.
  A server started inside a worktree resolves *that worktree's*
  `.claude/` as the bundle, so an unmerged, still-in-review branch can
  overwrite the user's global config. Under a real dispatch — workers
  running in parallel worktrees — which copy runs is a coin flip.
- **The namespace's own charter is project-scoped.** Per
  `redesign-skill-namespace-and-dispatch` (archived 2026-07-17),
  `/ithy-opsx:*` is defined as "ithyno-tied: requires `.worktrees/`,
  `agents.yaml`, ithyno's HTTP API, its `review.md` schema." Putting
  those commands into a user's global shell — active in projects that
  have no ithyno at all — contradicts that definition.

The right pattern already exists in this repo, and I ignored it.
`templates/.claude/skills/openspec-flow/SKILL.md` has shipped since
`expand-init-to-scaffold-agents`; every Init'd project scaffolds it.
`bin/init.js:166` walks `templates/` generically. Adding
`/ithy-opsx:*` under `templates/` distributes them the same way,
with no new copy logic and no new global state.

That fit dissolves several problems at once: `templates/` files
version-track with the dev repo (no drift); scaffolded copies live in
the target project's git (visible, editable, no server-side install
step); a project that never ran ithyno Init doesn't get `/ithy-opsx:*`
(matching the "ithyno-tied" contract exactly); the `openspec-flow`
cross-reference in `ithy-opsx-revert/SKILL.md` resolves in every
scaffolded project (both files are in the same target `.claude/`).

The trade-off is honest and small: openspec-ui itself is the dev
environment, so it never runs Init; its `.claude/` **is** the source
of truth for the templates. Every other consumer — Electron users,
VS Code extension users, Import targets — gets `/ithy-opsx:*` when
Init runs, per the user's directive: "openspec-ui は開発環境であり
そもそも init をする必要はない、それ以外の electron や extension
から利用する初期化するプロジェクトは init からインストールで良い."

## What Changes

### Distribution model (add)

- **New**: Init scaffolds `/ithy-opsx:*` into the target project.
  `bin/init.js` already walks `templates/` and copies everything into
  the target. Adding files under `templates/.claude/commands/ithy-opsx/`
  and `templates/.claude/skills/ithy-opsx-*/` requires no new copy
  logic — the walk picks them up automatically.
- **Templates as sources of truth**: `templates/.claude/commands/ithy-opsx/`
  and `templates/.claude/skills/ithy-opsx-*/` are the canonical files.
  The dev repo's `.claude/commands/ithy-opsx/` and `.claude/skills/
  ithy-opsx-*/` are the *dev-copy* — checked in, used by ithyno-ui's
  own developers, kept byte-identical to the templates by a drift
  guard.
- **Drift-guard test**: a Vitest that reads every file under
  `.claude/commands/ithy-opsx/` and `.claude/skills/ithy-opsx-*/` and
  asserts a byte-identical file exists at the matching `templates/`
  path. Modelled on the existing `templates/.claude/skills/openspec-flow/`
  drift guard in `server/init.test.ts`. Runs in `npm test`, so PR
  reviews can't silently ship an update that misses one copy.

### User-global install machinery (remove)

Everything `unify-ithyno-slash-command-surface` added to make the
user-global model work is removed:

- **Server**: `server/install-skills.ts` and its test file. Startup
  wiring in `server/index.ts` (the `installIthyOpsxSkills()` call
  before `fastify.listen`). Both HTTP endpoints
  (`POST /api/doctor/install/ithy-opsx`,
  `POST /api/doctor/uninstall/ithy-opsx`).
- **Doctor**: the `ithyOpsx` field on `DoctorReport`
  (`server/doctor.ts`). The mirror in `web/src/types.ts`. The two
  test fixtures that had to add it (`server/init.test.ts`,
  `web/src/components/InitDialog.test.ts`).
- **Web**: `IthyOpsxRow` in `web/src/pages/Settings.tsx`.
  `installIthyOpsx` / `uninstallIthyOpsx` in `web/src/api.ts`.
- **CLI**: `bin/_install-skills-runner.ts`, and the
  `install-skills` / `uninstall-skills` subcommands in `bin/ithyno.js`.
- **Packaging**: the `.claude/commands/ithy-opsx` and
  `.claude/skills/ithy-opsx-*/**` entries in `package.json`'s `files`
  and in `electron/package.json`'s `extraResources`. The bundled npm
  / Electron artefacts no longer carry ithyno's own commands — those
  travel via `templates/`, which is already in `files` and
  `extraResources`.
- **Spec**: five requirements from `unify-ithyno-slash-command-surface`'s
  spec delta are removed (see below).

### Unify spec cleanup

Six requirements this proposal removes from `unify-ithyno-slash-command-surface`'s
spec delta (the change is committed on `develop` but not archived, so
its proposed requirements haven't landed in `openspec/specs/dashboard/spec.md`
yet — the delete is done in-place in the change's own delta file, not
via REMOVED annotations against a landed spec):

- `Ithyno's slash-command surface is bundled in distributed artifacts`
- `Ithyno's slash-command surface auto-installs to user home on startup`
- `Ithyno's slash-command surface is uninstallable`
- `Doctor reports ithy-opsx install state`
- `Settings shows ithy-opsx install controls`
- `Ithyno CLI exposes install / uninstall subcommands`

Two `unify` requirements are kept unchanged: the namespace-consolidation
requirement (`Ithyno's slash-command surface is \`/ithy-opsx:*\` exclusively`)
and the three renamed slash-command wrappers. The consolidation itself
was correct — this proposal only changes *how* those commands ship.

### Clean up the copies I left in `~/.claude/`

`~/.claude/commands/ithy-opsx/` and `~/.claude/skills/ithy-opsx-*/`
already exist on this developer machine (the installer wrote them
during its brief active life). The `.ithyno-install-manifest.json` next
to them lists exactly what was written. Impl deletes those files and
the manifest, so the dev machine is left in the same state a machine
that never installed would be in.

## Success

- `rm -rf ~/.claude/commands/ithy-opsx ~/.claude/skills/ithy-opsx-* ~/.claude/.ithyno-install-manifest.json`
  is a no-op after Impl runs its cleanup step (the dev-machine state
  matches a fresh clone).
- The ithyno server starts without touching `~/.claude/`.
- `GET /api/doctor` no longer has an `ithyOpsx` field. `Settings > Prerequisites`
  no longer renders the ithy-opsx row. `ithyno install-skills` and
  `ithyno uninstall-skills` no longer exist as CLI commands.
- **Fresh target project through Init**: `POST /api/init` (Electron
  or VS Code entry) → target ends up with `.claude/commands/opsx/*`
  (from `openspec init`) AND `.claude/commands/ithy-opsx/*` (from
  ithyno template scaffold) AND `.claude/skills/openspec-flow/`,
  `.claude/skills/ithy-opsx-*/` all together in one place, visible
  in the target's `git status`.
- **Manager PTY starting in that target** resolves `/ithy-opsx:*`
  from the target's own `.claude/`, exactly the same way it resolves
  `/opsx:apply` — no user-home dependency.
- **The drift-guard test fails loudly** if a developer edits the dev-
  copy without updating the template (or vice versa).
- **`npm pack --dry-run`** shows `.claude/commands/ithy-opsx/` and
  `.claude/skills/ithy-opsx-*/**` NOT in the tarball's non-template
  paths (only via `templates/`).
- **`unify`'s spec delta contains only the four requirements it kept**.

## Non-goals

- **This proposal does NOT change the `/opsx:*` distribution.** Those
  are upstream openspec, restored to the dev repo via `openspec update`
  in commit `9951eae`, and delivered to targets by `openspec init` per
  upstream's own contract. Not our surface.
- **This proposal does NOT scaffold `/ithy-opsx:*` into projects that
  never ran ithyno Init.** A project with just `openspec init` and no
  ithyno Init gets `/opsx:*` and no `/ithy-opsx:*`. That matches the
  "ithyno-tied" definition of the namespace exactly — if there's no
  Init'd `agents.yaml`, there's no Manager to dispatch, so there's
  nothing for `/ithy-opsx:dispatch` to do anyway.
- **Pattern A imports (external target)** are unaffected: the sub-
  agent that runs in the target does file operations only, not
  `/ithy-opsx:*` slash commands. When the user later opens that
  imported project as an ithyno project (via project-switch), if they
  want `/ithy-opsx:*` there they run ithyno Init on it — same as any
  other project.
- **No migration for existing installed users.** There are no external
  installed users; the only machine that ran the installer is this dev
  machine, cleaned up as part of Impl.
- **No version-tracked manifest, no drift detection at runtime, no
  Settings row, no CLI subcommand.** All of that machinery existed
  because the scattered copies needed managing. Under this proposal
  the copies are project-tracked in git, so git itself is the
  manifest and `git status` is the drift detector.
