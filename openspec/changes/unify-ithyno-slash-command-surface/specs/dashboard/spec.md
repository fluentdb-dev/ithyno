## MODIFIED Requirements

### Requirement: Escalate Command Wrapper

The `/ithy-opsx:escalate <change-id> "<question>"` slash command SHALL exist as a prompt template that instructs a Claude Code session to construct a JSON body containing the question and a context string assembled from the change's current state (phase, recent diff summary, prior review verdict) and to invoke `POST /api/changes/<change-id>/needs-human` via a Bash + curl call to `http://localhost:4321`. On HTTP 2xx the template SHALL report success to the caller; on non-2xx it SHALL surface the error body for further handling.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/ithy-opsx/escalate.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads and follows the curl-based escalation flow

#### Scenario: successful escalation
- **GIVEN** the endpoint returns HTTP 200
- **WHEN** the template's post-flow reporting runs
- **THEN** the caller receives an "escalated" confirmation with the API's returned status snippet

#### Scenario: error surfaced
- **GIVEN** the endpoint returns HTTP 400 (empty question) or 409 (already escalated)
- **WHEN** the template's error-handling runs
- **THEN** the caller receives the endpoint's error message verbatim so it can decide next action

### Requirement: Answer Command Wrapper

The `/ithy-opsx:answer <change-id> "<answer>"` slash command SHALL exist as a prompt template that instructs a Claude Code session to invoke `POST /api/changes/<change-id>/needs-human/answer` via Bash + curl to `http://localhost:4321` with the answer text as the JSON body, and to report the endpoint's response back to the caller. The template SHALL be safe to invoke only when the change is currently in `needs-human` state; the endpoint's 409 return is the safety net.

#### Scenario: template exists in commands directory
- **GIVEN** the repository at `.claude/commands/ithy-opsx/answer.md`
- **WHEN** a Claude Code session evaluates the slash command
- **THEN** the template loads and follows the curl-based answer flow

#### Scenario: successful answer
- **GIVEN** the endpoint returns HTTP 200 (change was in needs-human)
- **WHEN** the template's reporting runs
- **THEN** the caller receives an "answer submitted" confirmation

#### Scenario: 409 when not escalated
- **GIVEN** the endpoint returns HTTP 409 (change is not in needs-human)
- **WHEN** the template's error-handling runs
- **THEN** the caller receives the "change is not in needs-human" error verbatim

### Requirement: Revert Slash Command

The project SHALL provide a `/ithy-opsx:revert <scope>` slash command that a worker or user runs inside Claude Code to open a Case α or Case β revert change under the naming convention `revert-<scope>`. The command SHALL enforce the PENDING annotation and (Case α only) REVERTED annotation conventions documented in `CLAUDE.md` and `.claude/skills/openspec-flow/SKILL.md`.

Concretely, when invoked, the command SHALL:

1. Take an optional `<scope>` argument (kebab-case). If omitted, the command SHALL prompt the user for a scope description and derive the kebab-case id from it (same pattern as `/opsx:propose`).
2. Prompt the user for the target requirement(s) to revert. Multiple targets per capability are allowed; multiple capabilities are allowed.
3. For each target, classify Case α (target's ADDED delta has already reached `openspec/specs/<capability>/spec.md`) or Case β (target still in-flight in `openspec/changes/<target-id>/`).
4. Run `openspec new change revert-<scope>` and populate:
   - `proposal.md` with a `## Why` narrative and a `## Targets` list citing each target by id and its Case α / β classification;
   - `specs/<capability>/spec.md` with `## REMOVED Requirements` or `## MODIFIED Requirements` sections (Case α) or `## ADDED Requirements` describing the post-revert baseline (Case β);
   - `tasks.md` with a checklist of standard revert steps (spec deltas, impl reverts, target annotations, verification).
5. Insert `> ⚠️ **PENDING REMOVAL** by [revert-<scope>](path)` (or `PENDING MODIFICATION`) directly beneath the affected `### Requirement:` heading in the current `openspec/specs/<capability>/spec.md` for every target.
6. For Case α only, insert `> **REVERTED** by [revert-<scope>](path)` (or `PARTIALLY REVERTED` when only a subset of the target's requirements is affected) at the top of every archived target's `proposal.md`, immediately after the closing frontmatter delimiter.
7. Run `npm run openspec -- validate revert-<scope>` and report the result. If invalid, the command SHALL surface the error and stop before any git action.

The command SHALL NOT invoke `git commit`, `openspec archive`, or any destructive action — the resulting change goes through the standard `/ithy-opsx:apply` → `/ithy-opsx:archive` flow like any other.

The command's backing skill SHALL live at `.claude/skills/ithy-opsx-revert/SKILL.md`. The former `/opsx:revert` name and `opsx-revert` skill id SHALL NOT be recognized after this change ships — attempting them yields "Unknown command" from Claude Code.

#### Scenario: `/ithy-opsx:revert kanban-ui-lanes` (Case α, no argument prompt)
- **GIVEN** `openspec/specs/dashboard/spec.md` contains a landed requirement `Kanban Phase Swim Lanes`
- **AND** the user has determined they want to revert it
- **WHEN** the user invokes `/ithy-opsx:revert kanban-ui-lanes` and confirms the target selection
- **THEN** `openspec/changes/revert-kanban-ui-lanes/proposal.md`, `specs/dashboard/spec.md`, and `tasks.md` are created; a PENDING REMOVAL blockquote is inserted directly under `### Requirement: Kanban Phase Swim Lanes` in the current spec; the archived target proposal is annotated with a REVERTED blockquote; and `openspec validate revert-kanban-ui-lanes` reports VALID.

#### Scenario: Case β target — archived-target archive procedure
- **GIVEN** an in-flight change `openspec/changes/add-foo/` that has not yet been archived
- **WHEN** the user invokes `/ithy-opsx:revert foo` and picks the in-flight change as the target
- **THEN** the command SHALL follow the "Reverted-target archive (Case β)" procedure documented in `.claude/skills/openspec-flow/SKILL.md` — the target's `outcome.md` is rewritten to point at the revert, its `specs/` directory is deleted, and the revert's delta uses ADDED headers describing the post-revert baseline

#### Scenario: Command aborts on validation failure
- **GIVEN** the user typed an invalid scope containing a slash
- **WHEN** the command runs `openspec new change`
- **THEN** the CLI's error surfaces to the user
- **AND** no PENDING or REVERTED annotations are inserted anywhere

## ADDED Requirements

### Requirement: Ithyno's slash-command surface is `/ithy-opsx:*` exclusively

All ithyno-authored Claude Code slash-commands SHALL live under the `/ithy-opsx:*` namespace exclusively. Ithyno SHALL NOT add commands to the upstream `/opsx:*` namespace (which is owned by `openspec init` and represents upstream openspec's public API).

The complete set of ithyno-owned commands SHALL be:

- `/ithy-opsx:answer` — submit an answer that closes a needs-human escalation.
- `/ithy-opsx:apply` — apply-with-commit variant of `/opsx:apply`; runs the openspec apply flow, then commits.
- `/ithy-opsx:archive` — archive a change as one commit.
- `/ithy-opsx:dispatch` — run the code / review / verify chain for one change.
- `/ithy-opsx:dispatch-multi` — same as dispatch, for several changes concurrently.
- `/ithy-opsx:escalate` — post an escalation to `needs-human` for a change.
- `/ithy-opsx:import` — spawn a Task-tool sub-agent to generate first-draft specs for a target project.
- `/ithy-opsx:merge` — merge an agent worktree branch into develop.
- `/ithy-opsx:review` — review a change's diff and write `review.md`.
- `/ithy-opsx:revert` — open a Case α or Case β revert change (see Revert Slash Command).
- `/ithy-opsx:verify` — run the Node build chain (test / typecheck / build) and write `review.md`.

Every command SHALL have its file at `.claude/commands/ithy-opsx/<verb>.md` in the ithyno-ui repo. Skills that back these commands SHALL live under `.claude/skills/ithy-opsx-*/`. The ithyno-ui repo's `.claude/commands/opsx/` SHALL be empty of ithyno-authored files (upstream `openspec init` output continues to write to that path per-project as ithyno-external content).

#### Scenario: Ithyno-ui repo does not shadow upstream opsx commands
- **GIVEN** a fresh clone of the ithyno-ui repo
- **WHEN** the reviewer inspects `.claude/commands/opsx/`
- **THEN** it contains no ithyno-authored files (`apply.md`, `archive.md`, `explore.md`, `propose.md`, `sync.md` are not present)
- **AND** all ithyno-authored slash-command files live under `.claude/commands/ithy-opsx/`

#### Scenario: Namespace is closed
- **GIVEN** any Manager PTY started by ithyno on any project
- **WHEN** the user types `/opsx:answer`, `/opsx:escalate`, or `/opsx:revert`
- **THEN** Claude Code reports "Unknown command"
- **AND** the equivalent under `/ithy-opsx:` resolves normally

### Requirement: Ithyno's slash-command surface is bundled in distributed artifacts

The ithyno distribution SHALL include the `.claude/commands/ithy-opsx/*.md` files and every `.claude/skills/ithy-opsx-*/**` tree in every distribution channel:

- **npm package**: `package.json`'s `files` array SHALL include `.claude/commands/ithy-opsx` and `.claude/skills/ithy-opsx-*/**`, so `npm publish` and `npm pack` include the sources.
- **Electron packaged builds**: the electron-builder `extraResources` config SHALL copy the same trees into the packaged app resources tree at `app/.claude/`. This applies uniformly to Mac, Windows, and Linux builds.

The bundle SHALL contain ONLY files that live under `commands/ithy-opsx/` or `skills/ithy-opsx-*/`. It SHALL NOT include anything under `commands/opsx/` (empty of ithyno content per the previous requirement) or unrelated skills (e.g. `openspec-*`, `agmsg`, `unity-mcp-skill`).

#### Scenario: npm pack includes exactly the ithy-opsx tree
- **GIVEN** the ithyno repo at a released version
- **WHEN** `npm pack --dry-run` is run at the repo root
- **THEN** the output file list includes every `.claude/commands/ithy-opsx/*.md`
- **AND** the output file list includes every file under each `.claude/skills/ithy-opsx-*/` directory
- **AND** the output does NOT include any `.claude/commands/opsx/*` entry
- **AND** the output does NOT include any `.claude/skills/openspec-*` or `.claude/skills/opsx-revert` entry

#### Scenario: Electron packaged build contains the ithy-opsx tree
- **GIVEN** a Mac build has been produced via `npm run electron:package:mac`
- **WHEN** the contents of `dist/mac-*/ithyno.app/Contents/Resources/app/.claude/` are inspected
- **THEN** `commands/ithy-opsx/import.md` exists
- **AND** `skills/ithy-opsx-import/SKILL.md` exists
- **AND** `skills/ithy-opsx-revert/SKILL.md` exists

### Requirement: Ithyno's slash-command surface auto-installs to user home on startup

On every server startup, ithyno SHALL install the bundled `/ithy-opsx:*` commands and skills into the user's Claude configuration directory by copying the bundled files to the appropriate targets under `~/.claude/` (POSIX) or `%USERPROFILE%\.claude\` (Windows).

The install SHALL be:

- **Cross-platform** — implemented via `os.homedir()` + `path.join`, working uniformly on Mac, Windows, and Linux. Files SHALL be copied (`fs.copyFile`), not symlinked, so Windows does not require admin or developer-mode.
- **Version-tracked** — a manifest file at `~/.claude/.ithyno-install-manifest.json` records the installed ithyno version, install timestamp, and per-file sha256 checksums.
- **Idempotent** — on subsequent startups, the installer compares the manifest version against the currently bundled version and only re-copies when they differ (or when a caller passes `force: true`).
- **Non-destructive to user modifications** — if a target file's on-disk sha256 differs from the manifest's recorded value, the installer SHALL SKIP that file with a WARN log entry and record it in the manifest as `status: "user-modified"`. User edits SHALL NOT be overwritten.
- **Cleaning on version-down** — files listed in the OLD manifest but no longer present in the current bundle SHALL be removed as part of the install.
- **Non-fatal on error** — install failures SHALL log at ERROR level and continue server startup; HTTP requests SHALL still be accepted.

#### Scenario: Fresh install on a machine without the manifest
- **GIVEN** `~/.claude/.ithyno-install-manifest.json` does not exist AND `~/.claude/commands/ithy-opsx/` does not exist
- **WHEN** the ithyno server starts up
- **THEN** every bundled ithy-opsx command and skill is copied into `~/.claude/`
- **AND** the manifest is written with the current ithyno version and per-file sha256s
- **AND** the server logs a summary such as `[install-skills] copied N new + updated 0 → ~/.claude`

#### Scenario: Re-launch at the same version is a no-op
- **GIVEN** the manifest exists AND `installedVersion === current-ithyno-version` AND every listed file exists on disk
- **WHEN** the server starts up
- **THEN** no files are copied
- **AND** the server logs `[install-skills] up to date (version <X>)`

#### Scenario: User-modified file is preserved on upgrade
- **GIVEN** the user has hand-edited `~/.claude/commands/ithy-opsx/apply.md` since the last install
- **WHEN** the server starts up at a newer bundled version
- **THEN** `apply.md` is NOT overwritten
- **AND** the server logs `[install-skills] skipped (user-modified): commands/ithy-opsx/apply.md`
- **AND** the new manifest records the file with `status: "user-modified"`

#### Scenario: Install failure does not block server startup
- **GIVEN** the user's home directory is not writable or another filesystem error occurs
- **WHEN** the server starts up
- **THEN** the failure is logged at ERROR level with the reason
- **AND** the server proceeds to `fastify.listen` and accepts HTTP requests

### Requirement: Ithyno's slash-command surface is uninstallable

Ithyno SHALL provide a mechanism to remove all files installed by the auto-installer, restoring `~/.claude/` to its pre-install state with respect to `/ithy-opsx:*`.

Uninstall SHALL:

- Read the manifest and delete every listed file.
- Remove now-empty `commands/ithy-opsx/` and `skills/ithy-opsx-*/` directories.
- Delete the manifest itself.
- NOT touch any file NOT listed in the manifest (other tools' commands / skills such as `agmsg.md`, `openspec-*`, or user-authored content preserved).

Uninstall SHALL be triggerable via two channels:

- `POST /api/doctor/uninstall/ithy-opsx` (session-token gated) — for the Settings UI.
- `ithyno uninstall-skills` CLI subcommand — for scripts and headless installs.

#### Scenario: Uninstall removes all installed files
- **GIVEN** a fresh install has run successfully
- **WHEN** the uninstaller is invoked
- **THEN** every file listed in the manifest is deleted
- **AND** the manifest itself is deleted
- **AND** the empty `commands/ithy-opsx/` and `skills/ithy-opsx-*/` directories are removed
- **AND** other files under `~/.claude/` (e.g. `commands/agmsg.md`, unrelated skills) are preserved

#### Scenario: Uninstall is idempotent
- **GIVEN** uninstall has already run once
- **WHEN** the uninstaller is invoked again
- **THEN** no files are deleted
- **AND** no error is raised

### Requirement: Doctor reports ithy-opsx install state

`GET /api/doctor` SHALL include a top-level `ithyOpsx` field of shape:

```
{
  installed: boolean,
  installedVersion: string | null,
  bundledVersion: string,
  commandCount: number,
  skillCount: number,
  userModifiedFiles: string[],
  installError: string | null
}
```

`installed` is true iff the manifest exists AND every bundled file has a corresponding on-disk target.

`readyForManager` semantics SHALL NOT change — install state does NOT gate Manager PTY readiness (the Manager starts regardless).

#### Scenario: Doctor reports installed state after successful install
- **GIVEN** the server has just completed a fresh install
- **WHEN** an authorized client calls `GET /api/doctor`
- **THEN** the response includes `ithyOpsx.installed === true`
- **AND** `ithyOpsx.installedVersion` equals the current ithyno version
- **AND** `ithyOpsx.installError` is null

#### Scenario: Doctor reports user-modified files
- **GIVEN** the user has hand-edited one installed file, and the next install pass has recorded it as user-modified
- **WHEN** the client calls `GET /api/doctor`
- **THEN** `ithyOpsx.userModifiedFiles` contains that file's relative path
- **AND** `ithyOpsx.installed` remains true

### Requirement: Settings shows ithy-opsx install controls

The dashboard Settings page's Prerequisites section SHALL render an "ithy-opsx skills" row exposing install state and action controls:

- When `installed === false`, the row SHALL show an `[Install]` button that invokes `POST /api/doctor/install/ithy-opsx`.
- When `installed === true`, the row SHALL show `[Reinstall]` (invokes install with `force: true`) and `[Uninstall]` (opens a confirm dialog, then invokes `POST /api/doctor/uninstall/ithy-opsx`).
- When `userModifiedFiles.length > 0`, the row SHALL show a ⚠ badge with a tooltip listing the modified paths.
- On successful install/uninstall (server broadcasts `doctor-updated` WS event), the row SHALL refresh automatically without a full page reload.

#### Scenario: Installed row shows the reinstall + uninstall pair
- **GIVEN** `doctor.ithyOpsx.installed === true` AND `userModifiedFiles.length === 0`
- **WHEN** the user opens the Settings page
- **THEN** a Prerequisites row labeled "ithy-opsx skills" renders with a ✓ status icon
- **AND** `[Reinstall]` and `[Uninstall]` buttons are visible
- **AND** the row shows the installed version and file counts

#### Scenario: Uninstall confirmation dialog
- **GIVEN** the user has clicked `[Uninstall]`
- **WHEN** the confirmation dialog renders
- **THEN** it names the number of files that will be removed
- **AND** offers `[Cancel]` and `[Uninstall]` actions
- **AND** on `[Uninstall]`, the POST endpoint is called and the row refreshes on the `doctor-updated` broadcast

### Requirement: Ithyno CLI exposes install / uninstall subcommands

`bin/ithyno.js` SHALL expose two subcommands for headless environments and scripts:

- `ithyno install-skills [--force]` — runs the installer with the given force flag. Prints the InstallReport. Exit 0 on success, 1 on error.
- `ithyno uninstall-skills` — runs the uninstaller. Prints the UninstallReport. Exit 0 on success, 1 on error.

#### Scenario: Install subcommand populates user Claude dir
- **GIVEN** a machine with `~/.claude/commands/ithy-opsx/` absent
- **WHEN** the user runs `ithyno install-skills` in a shell
- **THEN** the command exits 0
- **AND** stdout contains a summary line naming how many commands and skills were installed
- **AND** `~/.claude/commands/ithy-opsx/apply.md` exists

#### Scenario: Uninstall subcommand cleans up
- **GIVEN** ithy-opsx has been installed
- **WHEN** the user runs `ithyno uninstall-skills`
- **THEN** the command exits 0
- **AND** every file listed in the manifest is removed from disk
- **AND** stdout summarizes the count of removed files
