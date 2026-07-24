---
tags: [dashboard, cli, ithy-opsx, namespace, install, electron, packaging, cross-platform, breaking]
execution: worktree
---

## Why

Ithyno's Claude Code slash-command surface today is split across two
namespaces without a coherent reason:

- **Upstream `/opsx:*`** (from `openspec init`): `apply`, `archive`,
  `explore`, `propose`, `sync`, `update` — the public API of openspec
  itself. Shipped by `openspec init` into every target project's
  `.claude/commands/opsx/`. Not ithyno-owned.

- **Ithyno's `/opsx:*` additions**: `answer`, `escalate`, `revert`
  (with backing skill `opsx-revert`) — ithyno-authored, layered on
  top of upstream's namespace. Currently ONLY present in the
  ithyno-ui dev repo's `.claude/`; end users never get them.

- **Ithyno's `/ithy-opsx:*`**: `apply`, `archive`, `dispatch`,
  `dispatch-multi`, `import`, `merge`, `review`, `verify` (with
  backing skills `ithy-opsx-*`) — ithyno's workflow orchestration.
  Currently ONLY present in the ithyno-ui dev repo's `.claude/`;
  end users never get them either.

The three-way split has three concrete problems:

1. **Ithyno's own additions don't reach users**. `/opsx:answer`,
  `/opsx:escalate`, `/opsx:revert`, `/ithy-opsx:*` all only work when
  the user is inside the ithyno-ui repo. Any other project ithyno is
  opened on — including the entire Pattern B Import flow — fails
  with "Unknown command" the moment the Manager PTY resolves a
  slash-command that lives ONLY in ithyno-ui's `.claude/`. This was
  the immediate blocker that motivated this change.

2. **Shadow duplicates create version drift**. Ithyno-ui's
  `.claude/commands/opsx/` has five files (`apply.md`, `archive.md`,
  `explore.md`, `propose.md`, `sync.md`) that duplicate upstream
  openspec's own commands. These snapshots become stale as upstream
  openspec evolves — the target project (via `openspec init`) has
  `update.md`, but ithyno-ui's shadow doesn't. If we ever shipped
  these shadows to end users, we'd silently override their fresh
  upstream commands with our stale copies.

3. **Category confusion**. Ithyno-authored slash-commands are split
  across `/opsx:*` and `/ithy-opsx:*` for no principled reason.
  A user seeing `/opsx:revert` cannot tell if it's shipped by
  openspec or by ithyno. Same problem for maintainers reading the
  code.

The right architecture — established in preceding design discussion —
is: **ithyno owns exactly one namespace, `/ithy-opsx:*`, end-to-end**.
Upstream `/opsx:*` remains the province of `openspec init` and is
not touched by ithyno. Users who want ithyno's workflow always type
`/ithy-opsx:<verb>`; users who want raw openspec workflow always
type `/opsx:<verb>`. The two namespaces coexist cleanly without
overlap, without shadowing, and without ambiguity.

This change:
- Moves ithyno's `/opsx:*` additions into `/ithy-opsx:*`.
- Deletes the shadow duplicates.
- Ships `/ithy-opsx:*` as an installable Claude Code skill pack
  bundled with the ithyno distribution (npm + Electron packaged
  binary on Mac / Windows / Linux).
- Auto-installs the bundle into the user's `~/.claude/` on server
  startup, with sha256-per-file manifest tracking, cross-platform
  copy semantics, and preservation of user modifications.

Superseded work (from the earlier `bundle-and-install-ithy-opsx-
skills` proposal that was discarded before merge): the installer
implementation approach — copy-based, manifest-tracked, cross-
platform — is retained; only the bundle enumeration changes to
reflect the unified `/ithy-opsx:*`-only namespace.

## What Changes

### Namespace migration (breaking)

- **Rename ithyno's `/opsx:*` additions to `/ithy-opsx:*`**:
  - `.claude/commands/opsx/answer.md` → `.claude/commands/ithy-opsx/answer.md`
  - `.claude/commands/opsx/escalate.md` → `.claude/commands/ithy-opsx/escalate.md`
  - `.claude/commands/opsx/revert.md` → `.claude/commands/ithy-opsx/revert.md`
  - `.claude/skills/opsx-revert/` → `.claude/skills/ithy-opsx-revert/`
  - Update each renamed file's frontmatter `name:` field
    (`"OPSX: Answer"` → `"ITHY-OPSX: Answer"` etc.).

- **Delete shadow duplicates** (upstream openspec files ithyno-ui
  had snapshotted, now leaves to `openspec init` to provide):
  - `.claude/commands/opsx/apply.md`
  - `.claude/commands/opsx/archive.md`
  - `.claude/commands/opsx/explore.md`
  - `.claude/commands/opsx/propose.md`
  - `.claude/commands/opsx/sync.md`

- **After removal, ithyno-ui's `.claude/commands/opsx/` is empty**.
  Ithyno-ui-as-a-project still gets upstream `/opsx:*` via its own
  `openspec init` output (which it can re-run to refresh). This
  change does NOT run `openspec init` on ithyno-ui itself.

- **Update every internal reference** (`/opsx:answer` →
  `/ithy-opsx:answer`, `/opsx:escalate` → `/ithy-opsx:escalate`,
  `/opsx:revert` → `/ithy-opsx:revert`; `opsx-revert` skill
  identifier → `ithy-opsx-revert`) in:
  - `.claude/commands/ithy-opsx/dispatch.md` (currently references
    `/opsx:escalate` for the escalation ladder).
  - `openspec/specs/dashboard/spec.md` (contains a full requirement
    block for `/opsx:revert` scenarios).
  - `docs/2026-07-07-phase-3-through-6-decomposition.md`.
  - `docs/2026-07-11-manager-usage-and-agents-migration.md`.
  - Any test string literal referencing these names.

- **No backwards-compat shim**. `/opsx:answer` `/opsx:escalate`
  `/opsx:revert` become "Unknown command" in Claude Code after this
  ships. Rationale: the current userbase for these commands is
  ithyno's own developers (per session context, no external adopters
  yet). Shipping an alias would reintroduce the shadow duplicate
  problem this change is fixing.

### Distribution — bundle for shipping

- **npm `files`**: add `.claude/commands/ithy-opsx` and
  `.claude/skills/ithy-opsx-*/**` to the root `package.json`'s
  `files` array so `npm publish` / `npm pack` include the tree.
  (Do NOT include `.claude/commands/opsx` — after this change it is
  empty of ithyno content.)

- **Electron `extraResources`**: extend `electron/package.json`'s
  `build.extraResources` to copy `../.claude/commands/ithy-opsx`
  and `../.claude/skills` (with filter `["ithy-opsx-*/**"]`) into
  the packaged app's resources tree at `app/.claude/`. Same shape
  on Mac / Windows / Linux under electron-builder.

### Installer — copy to user home (cross-platform)

- **`server/install-skills.ts`** (new module) exports:
  - `resolveBundledSkillsRoot(): string` — env override →
    `process.resourcesPath/app/.claude` → walk up from module dir
    looking for `package.json` + `.claude/`.
  - `resolveUserClaudeRoot(): string` — `os.homedir()/.claude`.
    Works on POSIX (`$HOME`) and Windows (`%USERPROFILE%`) via
    `os.homedir()`.
  - `installIthyOpsxSkills({ force? }): Promise<InstallReport>` —
    walks `commands/ithy-opsx/*` + `skills/ithy-opsx-*/**`, copies
    each into the equivalent `~/.claude/` path. Copy semantics
    (never symlink) so Windows works without admin. Sha256-per-file
    manifest at `~/.claude/.ithyno-install-manifest.json` tracks
    installed version + hashes. Same-version = no-op. Version bump
    = overwrite unmodified files, preserve user-modified. Files in
    old manifest but not current bundle = removed.
  - `uninstallIthyOpsxSkills(): Promise<UninstallReport>` — reads
    manifest, removes listed files, removes empty ithy-opsx dirs,
    deletes manifest. Never touches unrelated files.
  - `checkIthyOpsxInstall(): Promise<IthyOpsxDoctor>` — snapshot
    for `/api/doctor`.

- **Server startup wire**: `server/index.ts` calls
  `installIthyOpsxSkills()` before `fastify.listen`. Errors non-
  fatal, logged. Doctor surfaces failure state.

### HTTP endpoints

- **`POST /api/doctor/install/ithy-opsx { force?: boolean }`** —
  session-token gated; runs installer with the given force flag;
  broadcasts `doctor-updated` WS event on success.
- **`POST /api/doctor/uninstall/ithy-opsx`** — session-token gated;
  runs uninstaller; broadcasts `doctor-updated`.

### Doctor extension

- `runDoctor()` returns a new top-level field
  `ithyOpsx: { installed, installedVersion, bundledVersion,
  commandCount, skillCount, userModifiedFiles, installError }`.
- `readyForManager` semantics UNCHANGED — install state does NOT
  gate Manager PTY readiness.

### Settings UI

- Prerequisites section gains an "ithy-opsx skills" row showing
  install version + counts + status icon.
- `installed === false` → `[Install]` button.
- `installed === true` → `[Reinstall]` + `[Uninstall]` (uninstall
  opens a confirm modal listing the affected file count).
- `userModifiedFiles.length > 0` → ⚠ badge with tooltip listing
  the paths.

### CLI subcommands

- `ithyno install-skills [--force]` and `ithyno uninstall-skills`
  in `bin/ithyno.js`, running the same install/uninstall logic as
  the server startup path. Useful for headless / scripted setups.

## Success

- **Pattern B Import works end-to-end from any project**: ithyno
  opened on a project with `agents.yaml` → Import → server injects
  `/ithy-opsx:import <path>` → Manager PTY (any cwd) resolves the
  command via `~/.claude/commands/ithy-opsx/import.md` → sub-agent
  spawns → GENERATED.md written → dashboard transitions.
- **`/ithy-opsx:answer <id> "<answer>"`, `/ithy-opsx:escalate <id>
  "<reason>"`, `/ithy-opsx:revert <scope>`** all resolve for
  end users on Mac / Windows / Linux after their first ithyno
  launch.
- **Ithyno-ui repo's `.claude/commands/opsx/` is empty**;
  ithyno-authored slash-commands live exclusively under
  `.claude/commands/ithy-opsx/`. `.claude/skills/opsx-revert/`
  is gone; `.claude/skills/ithy-opsx-revert/` exists.
- **No leftover references** in server code, skills, specs, or
  docs to the retired names (`/opsx:answer`, `/opsx:escalate`,
  `/opsx:revert`, `opsx-revert`).
- **Fresh install on any platform**: `~/.claude/commands/ithy-opsx/`
  populated with all 11 commands (existing 8 `ithy-opsx/*.md` +
  the 3 migrated `answer`, `escalate`, `revert`); `~/.claude/skills/
  ithy-opsx-*/` populated with all 6 skill dirs (existing 5 +
  migrated `ithy-opsx-revert`); manifest written.
- **`npm pack --dry-run`** lists every migrated command + skill file
  under `.claude/commands/ithy-opsx/` and `.claude/skills/
  ithy-opsx-*/`.
- **`npm run electron:package:{mac,win,linux}`** produces artifacts
  whose extracted `app/.claude/` contains the same set.
- **Idempotent re-launch**: manifest matches bundled version → no-op
  install log line.
- **Version-bump replays** overwrite unmodified files, preserve
  user-modified with a WARN log + `status: "user-modified"` manifest
  entry.
- **`ithyno uninstall-skills`** removes every manifest-listed file
  and preserves everything else under `~/.claude/`.

## Non-goals

- This change does NOT touch upstream `/opsx:*` in any target project.
  End users' `openspec init` output continues to place `/opsx:apply`
  et al. in `<target>/.claude/commands/opsx/` as before.
- This change does NOT scaffold `/ithy-opsx:*` into target projects
  at Init time. All ithy-opsx files live user-globally under
  `~/.claude/`, matching their nature as ithyno-server-lockstep
  tooling (not project-committed workflow files).
- This change does NOT provide a backwards-compat alias for the
  retired `/opsx:{answer,escalate,revert}` names. Users who typed
  them by muscle memory will get "Unknown command" and must type
  the `/ithy-opsx:` form.
- This change does NOT bring ithyno-ui's own `.claude/` in sync with
  the latest upstream openspec (missing `update.md` +
  `openspec-update-change` skill). That is a separate house-keeping
  task — ithyno-ui developer can `openspec update` when they choose.
- This change does NOT add a Windows CI matrix. Design is cross-
  platform-safe by construction (`os.homedir()`, `path.join`, copy-
  not-symlink); runtime Windows validation is a follow-up when a
  Windows environment is available.
- This change does NOT modify Claude Code's command hot-reload
  behavior (there isn't any). Users may need to restart their
  Manager PTY once after the first install to pick up the new
  commands; documented as a known limitation.
