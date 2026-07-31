## MODIFIED Requirements

### Requirement: openspec init invokes per-CLI renderers rather than blind template copy

The `openspec init` flow SHALL scaffold the project's skill surface by invoking the cross-CLI renderers for each user-selected CLI, rather than by copying a hardcoded `.claude/` template tree verbatim. The renderer set is defined by `server/skill-renderer/renderers/index.ts` and aligns with the CLI enum documented above.

The init flow SHALL continue to copy CLI-neutral fixtures from `templates/` (e.g., `CLAUDE.md`, `openspec/README.md`, `agents.yaml.tmpl`, `.gitignore` maintenance) that do not depend on which CLI the user chose. `templates/.claude/commands/` AND `templates/.claude/skills/` SHALL both be removed once every skill they hold has a working renderer path.

`bin/init.js`'s `runInit` SHALL accept the chosen Manager CLI (`managerCli` option or equivalent) and pass it to renderer invocation. The `resolveManagerFromDoctor` result (already computed in the HTTP init flow) is the source of truth for which CLI to render. If no CLI is passed (e.g. a bare `bin/ithyno init` CLI invocation), the flow SHALL fall back to `"claude"` to keep single-user CLI workflows working without a picker.

For every CLI in `server/doctor.ts::Cli` (`claude`, `codex`, `agy`, `copilot`, `gemini`, `opencode`, `cursor`, `antigravity`), the init flow SHALL EITHER invoke a renderer that materializes at least the currently-ported ithy-opsx skills (baseline: `ithy-opsx-apply` and `ithy-opsx-dispatch` as of `port-ithy-opsx-dispatch-to-universal-source`) OR fail loudly with `"no renderer for <cli>; supported: <list>"` — silent mis-scaffolding (running init with agy and getting `.claude/` populated) is prohibited.

When the antigravity renderer is invoked (either directly with `cli: "antigravity"` or via the `agy → antigravity` alias resolved by `mapDoctorCliToRendererCli`), `installSkills` SHALL first invoke a one-shot legacy-directory MIGRATION (destructive, MOVE semantics) that moves any `.agent/workflows/*.md` files (typically written by openspec's own antigravity adapter, which is on the outdated `.agent/` convention) into `.agents/workflows/`. The migration SHALL:
- Skip any file whose target `.agents/workflows/<same-basename>` already exists, leaving the legacy file in place and reporting it in `InstallResult.migrations[].skipped[]` with reason `"target exists"` — the renderer's own subsequent write remains authoritative.
- Move every non-conflicting file with `fs.rename` semantics (single atomic step where the platform supports it; fall back to copy+unlink otherwise).
- After moving, `rmdir` the empty `.agent/workflows/` directory and its parent `.agent/` directory if either is empty (do NOT rmdir if non-empty — respect user files).
- Be idempotent: a second invocation finds nothing and returns an empty `moved[]` and `skipped[]`.
- Honor `opts.dryRun`: report the planned moves in `moved[]` without touching disk.

Additionally, when antigravity is selected, `installSkills` SHALL invoke a second helper that COPIES any `.claude/commands/ithy-opsx/*.md` files into `.agents/workflows/ithy-opsx/<same-basename>`. These files are typically ithyno-ui's own `ithy-opsx-*` skills that were hand-authored (or blind-copied) into `.claude/` by pre-per-CLI-renderer scaffold flows. The COPY step SHALL:
- Preserve the source: the `.claude/commands/ithy-opsx/*.md` files SHALL NOT be modified or deleted (Claude users of the same project remain unaffected).
- Skip on target conflict: if `.agents/workflows/ithy-opsx/<same-basename>` already exists (e.g. because the antigravity renderer already wrote it, or a prior copy step ran), leave both source and target untouched and report the source in the entry's `skipped[]`.
- Be idempotent, dryRun-aware, per the same shape as the legacy-dir migration.

Both operations SHALL be surfaced in `InstallResult.migrations` as separate entries. Each entry MAY carry an optional `kind: "move" | "copy"` field to distinguish the semantics (`"move"` for the legacy-dir migration, `"copy"` for the claude-commands mirror). Consumers that ignore `kind` SHALL treat entries the same way — the field is purely diagnostic. Migration failures (permission errors, EBUSY on rename, ENOENT during copy) SHALL be routed to `InstallResult.errors` per file, NOT thrown — a partial migration must not block installing healthy skills.

The migration result SHALL be surfaced in `InstallResult.migrations` as a new top-level array so callers (init HTTP endpoint, CLI, tests) can log or display it. Migration failures (permission errors, EBUSY on rename) SHALL be routed to `InstallResult.errors` per file, NOT thrown — a partial migration must not block installing healthy skills.

Migration for projects scaffolded before this change: those projects already have `.claude/commands/ithy-opsx/*` on disk even if their Manager isn't Claude. This change does NOT auto-migrate them. Recovery is to re-run `openspec init` on the same project directory (idempotent by design) OR manually remove stale `.claude/` entries and re-run.

The set of ported universal skills under `ithyno/skills/` grows over time as ithy-opsx surface is migrated from `.claude/commands/*.md` (hand-authored, Claude-only) to `ithyno/skills/*/SKILL.md + manifest.yaml` (universal + rendered). Renderers pick up new sources automatically — no renderer-side code change is required when a new skill is ported.

#### Scenario: init emits per-CLI files based on selection
- **GIVEN** `openspec init` is invoked in a fresh directory
- **WHEN** the user selects `claude`
- **THEN** `.claude/commands/opsx/*`, `.claude/commands/ithy-opsx/*`, `.claude/skills/ithy-opsx-*/` are populated by the claude renderer
- **AND** `CLAUDE.md` is copied from `templates/CLAUDE.md` (CLI-neutral fixture)
- **AND** no `templates/.claude/…` blind-copy occurs for CLI-specific skill files
- **WHEN** the user instead selects `agy`
- **THEN** the antigravity renderer materializes the skill surface at antigravity's declared path (e.g. `.agents/workflows/ithy-opsx/<cmd>.md` per the renderer's nested colon-form output)
- **AND** `.claude/commands/` is NOT populated by the renderer (Claude was not selected)
- **AND** `agents.yaml` writes `manager.command: agy` (unchanged from existing behavior)

#### Scenario: init preserves CLI-neutral fixtures
- **GIVEN** `openspec init` is invoked with any CLI selection
- **WHEN** the scaffolder walks `templates/`
- **THEN** files under `templates/.claude/commands/` and `templates/.claude/skills/` are skipped by `walkTemplates`
- **AND** other `templates/` files (e.g. `CLAUDE.md`, `openspec/README.md`, `agents.yaml.tmpl`) are copied unchanged

#### Scenario: init errors loudly when no renderer exists for the chosen CLI
- **GIVEN** `openspec init` is invoked with a Manager CLI whose renderer is missing
- **WHEN** init resolves the render step
- **THEN** init returns a non-zero exit / HTTP 400 with message naming the missing renderer AND the list of CLIs that DO have renderers
- **AND** NO fallback to a Claude scaffold occurs (silent-mis-scaffold is prohibited)

#### Scenario: init falls back to claude when managerCli is not supplied
- **GIVEN** a bare `bin/ithyno init <target>` invocation with no `managerCli` argument
- **WHEN** `runInit` is called
- **THEN** the claude renderer is invoked as the default (preserves single-user CLI workflow that predates the picker)

#### Scenario: init emits every ported ithy-opsx skill per selected CLI
- **GIVEN** `ithyno/skills/` contains `ithy-opsx-apply` and `ithy-opsx-dispatch` (baseline coverage as of this change)
- **WHEN** `openspec init` is invoked and the user selects any CLI (e.g. `agy`)
- **THEN** the renderer emits BOTH skills at the CLI's declared paths (e.g. `.agents/workflows/ithy-opsx/apply.md` AND `.agents/workflows/ithy-opsx/dispatch.md`)
- **AND** the emitted files each carry the `GENERATED FILE — do not hand-edit` banner sourcing back to `ithyno/skills/<id>/`

#### Scenario: agy init migrates legacy .agent/workflows/ output into .agents/workflows/
- **GIVEN** a project that was previously scaffolded by `openspec init --tools antigravity` and has `.agent/workflows/opsx-propose.md`, `.agent/workflows/opsx-apply.md` on disk (openspec's own outdated-adapter output)
- **AND** `.agents/workflows/` does not yet exist
- **WHEN** the user re-runs init through openspec-ui with the antigravity renderer selected
- **THEN** `installSkills` invokes the migration BEFORE the render loop
- **AND** every `.agent/workflows/*.md` file is moved to `.agents/workflows/<same-name>` (renderer's own output at `.agents/workflows/ithy-opsx/<cmd>.md` then lands alongside them)
- **AND** the empty `.agent/workflows/` directory is removed
- **AND** the empty `.agent/` directory is removed (only if truly empty — user files under `.agent/` outside `workflows/` are respected)
- **AND** `InstallResult.migrations` contains at least one entry with `cli: "antigravity"`, `moved: [".agent/workflows/opsx-propose.md", ".agent/workflows/opsx-apply.md"]`, and (if `kind` is present) `kind: "move"`

#### Scenario: migration skips on target-file conflict rather than clobbering
- **GIVEN** a project has BOTH `.agent/workflows/opsx-apply.md` (stale, from a prior openspec init) AND `.agents/workflows/opsx-apply.md` (newer, from a subsequent scaffold that already handled the migration once)
- **WHEN** the antigravity migration runs
- **THEN** the file at `.agent/workflows/opsx-apply.md` is NOT moved (it would overwrite the newer target)
- **AND** the migration reports it in `InstallResult.migrations[].skipped[]` with reason `"target exists"`
- **AND** the newer `.agents/workflows/opsx-apply.md` is untouched (byte-identical to before the migration ran)

#### Scenario: migration is idempotent — second run is a clean no-op
- **GIVEN** the migration has already run once against a project (all `.agent/workflows/*.md` have moved and `.agent/` was removed)
- **WHEN** `installSkills` is re-invoked (e.g., the user re-runs init)
- **THEN** the migration helper finds no `.agent/workflows/` directory
- **AND** returns `{ moved: [], skipped: [] }` without error
- **AND** `InstallResult.migrations[0]` still carries the antigravity entry (with the empty arrays), so callers can distinguish "ran and found nothing" from "was not invoked at all"

#### Scenario: migration honors dry-run
- **GIVEN** a project with `.agent/workflows/opsx-propose.md` present
- **WHEN** `installSkills` is invoked with `dryRun: true` and antigravity selected
- **THEN** the migration reports the planned move in `moved[]` (as if it had happened)
- **AND** `.agent/workflows/opsx-propose.md` remains on disk unmodified
- **AND** `.agents/workflows/opsx-propose.md` is NOT created

#### Scenario: agy init copies legacy .claude/commands/ithy-opsx/ into .agents/workflows/ithy-opsx/
- **GIVEN** a project has `.claude/commands/ithy-opsx/dispatch.md` and `.claude/commands/ithy-opsx/merge.md` on disk (either hand-authored legacy or renderer output from a previous `[claude]` install)
- **AND** `.agents/workflows/ithy-opsx/` does not yet exist
- **WHEN** the user runs `installSkills` with antigravity selected
- **THEN** `installSkills` invokes the copy helper alongside the existing legacy-dir migration
- **AND** every `.claude/commands/ithy-opsx/*.md` file is COPIED to `.agents/workflows/ithy-opsx/<same-basename>`
- **AND** the source files at `.claude/commands/ithy-opsx/*` are unchanged (COPY, not move — Claude users of the same project unaffected)
- **AND** `InstallResult.migrations` gains a SECOND entry with `cli: "antigravity"`, `copied: [".claude/commands/ithy-opsx/dispatch.md", ".claude/commands/ithy-opsx/merge.md"]`, and `kind: "copy"`

#### Scenario: copy-from-claude skips on target-file conflict
- **GIVEN** `.claude/commands/ithy-opsx/dispatch.md` exists AND `.agents/workflows/ithy-opsx/dispatch.md` also already exists (e.g., because the antigravity renderer wrote it in the same install, or a prior copy step ran)
- **WHEN** the copy helper runs
- **THEN** the source file is NOT copied
- **AND** it appears in the entry's `skipped[]` with reason `"target exists"`
- **AND** both source and target files are byte-identical to their state before the helper ran

#### Scenario: copy-from-claude does not run when antigravity is not selected
- **GIVEN** a project has `.claude/commands/ithy-opsx/dispatch.md` present
- **WHEN** `installSkills` is invoked with only `[claude]` selected
- **THEN** the copy helper is NOT invoked
- **AND** `.agents/workflows/ithy-opsx/` is NOT created
- **AND** `InstallResult.migrations` contains no entry with `kind: "copy"` (nor any antigravity entry at all)
