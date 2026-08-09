# cross-cli-skill-installer Specification

## Purpose
TBD - created by archiving change generalize-skills-cross-cli. Update Purpose after archive.
## Requirements
### Requirement: Universal skill source layout

The project SHALL keep every ithyno skill's authoritative source under `ithyno/skills/<skill-id>/`, containing a CLI-neutral `SKILL.md` (prompt body written in portable markdown using capability tokens) and a `manifest.yaml` (metadata + per-CLI overrides). No CLI-specific skill file (`.claude/commands/*`, `.codex/*`, `.cursor/*`, etc.) SHALL be hand-authored — those files are generated output from the universal source.

The manifest SHALL declare at minimum `name`, `namespace`, `command`, `description`, `supports` (subset of the CLI enum), and `capabilities_required` (subset of the v1 capability tokens).

#### Scenario: skill source directory shape
- **GIVEN** a new skill `opsx-propose`
- **WHEN** an author adds it to the repo
- **THEN** exactly `ithyno/skills/opsx-propose/SKILL.md` and `ithyno/skills/opsx-propose/manifest.yaml` are created; no `.claude/commands/opsx/propose.md` is hand-authored
- **AND** the manifest passes the JSON schema at `schemas/skill-manifest.schema.json`

#### Scenario: hand-authored per-CLI file rejected by CI
- **GIVEN** a contributor edits `.claude/commands/opsx/propose.md` directly (bypassing the universal source)
- **WHEN** the CI drift-guard test runs
- **THEN** the test fails with a message naming the offending file and the source it drifts from
- **AND** the failure message tells the contributor to edit `ithyno/skills/opsx-propose/SKILL.md` instead and re-run `openspec init --skills-only`

### Requirement: Install-time CLI selection with doctor integration

The `openspec init` flow SHALL prompt the user to select which CLIs this workspace targets from the CLI enum (`claude | codex | antigravity | cursor | gemini | copilot | opencode`). The prompt SHALL consult `runDoctor()` and dim / auto-exclude CLIs not detected on the host, while still allowing the user to override and install anyway.

For each selected CLI, the applicable renderer SHALL run and emit the CLI's native surface files. Unselected CLIs SHALL have no files written.

#### Scenario: user picks claude and codex
- **GIVEN** `openspec init` is invoked in a fresh directory and both `claude` and `codex` CLIs are installed on the host
- **WHEN** the user selects `[claude, codex]` from the picker
- **THEN** the claude renderer emits `.claude/commands/<namespace>/<cmd>.md` (and, when the manifest requests, `.claude/skills/<skill-id>/SKILL.md`)
- **AND** the codex renderer emits Codex's native format at Codex's expected path
- **AND** no `.cursor/`, `.antigravity/`, `.gemini/`, `.github/copilot-instructions.md`, or `.opencode/` files are created

#### Scenario: doctor reports codex not installed
- **GIVEN** `openspec init` is invoked and `runDoctor()` reports `codex.installed = false`
- **WHEN** the picker renders
- **THEN** the `codex` option is visually dimmed and marked "not detected"
- **AND** the user can still select it (with a confirmation "install skills anyway?") — the install proceeds

### Requirement: Renderer contract and fragment-merge support

Each renderer SHALL implement `render(source: SkillSource, ctx: RenderContext) → RenderedFile[]`. Each `RenderedFile` SHALL declare its `path` (relative to project root), `content`, and `mode` (`create | overwrite | fragment-merge`).

The `fragment-merge` mode SHALL be idempotent: writing into a shared file (e.g. Copilot's `.github/copilot-instructions.md`) with the same skill source produces byte-identical output across repeated runs. Delimiters `<!-- ithyno:skill:<skill-id>:start -->` and `<!-- ithyno:skill:<skill-id>:end -->` demarcate each skill's section within the shared file.

A renderer that throws SHALL cause a soft-fail: the install continues with other CLIs, logs the error, and exits with a non-zero status summary at the end.

#### Scenario: fragment-merge idempotent replay
- **GIVEN** `.github/copilot-instructions.md` already contains the rendered section for `opsx-propose`
- **WHEN** the copilot renderer runs the same source against the same file
- **THEN** the file is byte-identical after the second run
- **AND** re-running with a modified source updates only the delimited section — surrounding user content is preserved

#### Scenario: one renderer throws does not block others
- **GIVEN** the codex renderer throws (e.g. Codex format changed and our renderer is outdated) during a claude+codex install
- **WHEN** `installSkills()` finishes
- **THEN** the claude renderer's files were still written
- **AND** the run exits non-zero
- **AND** the summary names codex as the failing CLI and includes the error text

### Requirement: Capability token vocabulary (v1)

Skill sources SHALL express CLI-dependent primitives as capability tokens rather than CLI-native syntax. The v1 vocabulary SHALL include at least:

- `<capability:subagent_spawn>` — launch a sub-worker with a prompt (Claude → Task tool; other CLIs → subprocess).
- `<capability:file_write>` — modify project files.
- `<capability:bash>` — shell out.

Renderers SHALL translate each token into the CLI's native invocation. A skill declaring a capability its target CLI cannot satisfy SHALL be skipped for that CLI at install time with a warning naming the skill and the missing capability.

A linter SHALL scan every `ithyno/skills/**/SKILL.md` for unknown `<capability:*>` tokens and reject them at CI time.

#### Scenario: skill using subagent_spawn on claude and codex
- **GIVEN** `opsx-propose`'s SKILL.md contains `<capability:subagent_spawn>` referencing a boot prompt
- **WHEN** the claude renderer runs
- **THEN** the token is expanded into a Task-tool invocation snippet
- **WHEN** the codex renderer runs
- **THEN** the token is expanded into a subprocess call to `codex --prompt <boot>` (or Codex's native equivalent)

#### Scenario: unknown token rejected by lint
- **GIVEN** a SKILL.md contains `<capability:teleport>` (not in the v1 vocabulary)
- **WHEN** `scripts/lint-skill-tokens.mjs` runs
- **THEN** it exits non-zero with a message naming the offending file, the unknown token, and the list of known tokens

### Requirement: Idempotent re-install with orphan cleanup

Running `openspec init --skills-only` (or re-running `openspec init` on an existing project) with a **different** CLI selection SHALL update, add, and remove per-CLI files cleanly. Prior install state SHALL be persisted at `.ithyno/install-state.json`; on re-run, files no longer belonging to any selected CLI SHALL be removed.

Re-running with the **same** CLI selection and unchanged sources SHALL produce byte-identical output and SHALL NOT touch file mtimes.

#### Scenario: shrink CLI set
- **GIVEN** a project has been installed with `[claude, codex]` and `.claude/` + `.codex/` both exist
- **WHEN** the user re-runs `openspec init --skills-only` and selects only `[claude]`
- **THEN** the `.claude/` files remain unchanged (byte-identical) or are updated if the source changed
- **AND** the `.codex/` files are removed
- **AND** `.ithyno/install-state.json` reflects the new selection

#### Scenario: no-op re-install
- **GIVEN** a project has been installed with `[claude]` and no source changed
- **WHEN** the user re-runs `openspec init --skills-only` with the same `[claude]` selection
- **THEN** no file is written
- **AND** no mtime is touched

### Requirement: Existing surface migrated to generated output

The `.claude/commands/` and `.claude/skills/` directories SHALL become generated output, not committed source, in projects scaffolded by `openspec init` (this repo's own `.claude/` is exempt — see below). The `.gitignore` init emits SHALL exclude them (with an exception for renderer-emitted stub README files that explain their generated status). `templates/.claude/commands/` AND `templates/.claude/skills/` SHALL both be removed once every skill under them has a renderer path; `bin/init.js`'s `walkTemplates` SHALL skip both trees and defer to the renderer for that content.

This repo's development-side `.claude/` (at `<repo>/.claude/`, containing the ithy-opsx skills that develop ithyno itself) is an exception — ithyno's own contributors use Claude Code, so committing the Claude-shaped surface for local development is intentional. Only the `templates/.claude/…` trees (which get COPIED into user projects during `openspec init`) are moved to renderer output.

The `server/init.test.ts` template-drift guard SHALL be updated to compare against renderer output rather than the removed `templates/.claude/` trees.

#### Scenario: fresh clone flow
- **GIVEN** a fresh `git clone` of a user project (no `.claude/`, no `.codex/`)
- **WHEN** the user runs `openspec init` and selects `[claude]`
- **THEN** `.claude/commands/opsx/propose.md` (and every other skill's claude output) is materialized
- **AND** the file matches the renderer's golden fixture for that source

#### Scenario: templates directory shrunk
- **GIVEN** the shipped ithy-opsx skills (`opsx:*`, `ithy-opsx:*`) have renderers
- **WHEN** `templates/.claude/commands/opsx/`, `templates/.claude/commands/ithy-opsx/`, `templates/.claude/skills/opsx-*`, and `templates/.claude/skills/ithy-opsx-*` are removed
- **THEN** `bin/init.js walkTemplates` skips those paths and defers to the renderer
- **AND** the init-scaffold-smoke-test still passes because the renderer emits equivalent files

#### Scenario: repo's own .claude/ is preserved
- **GIVEN** the ithyno repo's own top-level `.claude/commands/` and `.claude/skills/` exist as the developer-facing skill surface
- **WHEN** this change is applied
- **THEN** those directories remain committed and unchanged (the exception is only `templates/.claude/…`)

### Requirement: openspec init invokes per-CLI renderers rather than blind template copy

The `openspec init` flow SHALL scaffold the project's skill surface by invoking the cross-CLI renderers for each user-selected CLI, rather than by copying a hardcoded `.claude/` template tree verbatim. The renderer set is defined by `server/skill-renderer/renderers/index.ts` and aligns with the CLI enum documented above.

The init flow SHALL continue to copy CLI-neutral fixtures from `templates/` (e.g., `CLAUDE.md`, `openspec/README.md`, `agents.yaml.tmpl`, `.gitignore` maintenance) that do not depend on which CLI the user chose. `templates/.claude/commands/` AND `templates/.claude/skills/` SHALL both be removed once every skill they hold has a working renderer path.

`bin/init.js`'s `runInit` SHALL accept the chosen Manager CLI (`managerCli` option or equivalent) and pass it to renderer invocation. The `resolveManagerFromDoctor` result (already computed in the HTTP init flow) is the source of truth for which CLI to render. If no CLI is passed (e.g. a bare `bin/ithyno init` CLI invocation), the flow SHALL fall back to `"claude"` to keep single-user CLI workflows working without a picker.

For every CLI in `server/doctor.ts::Cli` (`claude`, `codex`, `agy`, `copilot`, `gemini`, `opencode`, `cursor`, `antigravity`), the init flow SHALL EITHER invoke a renderer that materializes at least the currently-ported ithy-opsx skills (baseline: `ithy-opsx-apply` and `ithy-opsx-dispatch` as of `port-ithy-opsx-dispatch-to-universal-source`) OR fail loudly with `"no renderer for <cli>; supported: <list>"` — silent mis-scaffolding (running init with agy and getting `.claude/` populated) is prohibited.

For `ithy-opsx-dispatch`, the Codex renderer SHALL emit both the canonical
`.codex/prompts/ithy-opsx-dispatch.md` workflow and a concise
`.codex/skills/ithy-opsx-dispatch/SKILL.md` catalog entrypoint. The Skill SHALL
reference the Prompt rather than duplicating its body and SHALL distinguish
single-change dispatch from `ithy-opsx-dispatch-multi`.

When the antigravity renderer is invoked (either directly with `cli: "antigravity"` or via the `agy → antigravity` alias resolved by `mapDoctorCliToRendererCli`), `installSkills` SHALL first invoke a one-shot legacy-directory MIGRATION (destructive, MOVE semantics) that moves any `.agents/workflows/*.md` files written by older ithyno builds into Agy's canonical `.agent/workflows/` directory. The migration SHALL:
- Skip any file whose target `.agent/workflows/<same-basename>` already exists, leaving the legacy file in place and reporting it in `InstallResult.migrations[].skipped[]` with reason `"target exists"` — the renderer's own subsequent write remains authoritative.
- Move every non-conflicting file with `fs.rename` semantics (single atomic step where the platform supports it; fall back to copy+unlink otherwise).
- After moving, `rmdir` the empty legacy `.agents/workflows/` directory and its parent `.agents/` directory if either is empty (do NOT rmdir if non-empty — respect user files).
- Be idempotent: a second invocation finds nothing and returns an empty `moved[]` and `skipped[]`.
- Honor `opts.dryRun`: report the planned moves in `moved[]` without touching disk.

Additionally, when antigravity is selected, `installSkills` SHALL invoke a second helper that COPIES any `.claude/commands/ithy-opsx/*.md` files into `.agent/workflows/ithy-opsx-<same-basename>`. These files are typically ithyno-ui's own `ithy-opsx-*` skills that were hand-authored (or blind-copied) into `.claude/` by pre-per-CLI-renderer scaffold flows. The COPY step SHALL:
- Preserve the source: the `.claude/commands/ithy-opsx/*.md` files SHALL NOT be modified or deleted (Claude users of the same project remain unaffected).
- Normalize the target frontmatter to Agy's description-only shape, removing Claude's `name`, `category`, `tags`, and `argument-hint` fields so Agy derives the slash command from the flat filename.
- Translate target-body `/opsx:<command>` and `/ithy-opsx:<command>` references to Agy's `/opsx-<command>` and `/ithy-opsx-<command>` forms.
- Skip on target conflict: if `.agent/workflows/ithy-opsx-<same-basename>` already exists (e.g. because the antigravity renderer already wrote it, or a prior copy step ran), leave both source and target untouched and report the source in the entry's `skipped[]`.
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
- **THEN** the antigravity renderer materializes each skill as a flat workflow at `.agent/workflows/ithy-opsx-<cmd>.md`
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
- **THEN** the renderer emits BOTH skills at the CLI's declared paths (e.g. `.agent/workflows/ithy-opsx-apply.md` AND `.agent/workflows/ithy-opsx-dispatch.md`)
- **AND** the emitted files each carry the `GENERATED FILE — do not hand-edit` banner sourcing back to `ithyno/skills/<id>/`

#### Scenario: agy init migrates legacy .agents/workflows/ output into .agent/workflows/
- **GIVEN** a project previously scaffolded by an older ithyno build with `.agents/workflows/opsx-propose.md`, `.agents/workflows/opsx-apply.md` on disk
- **AND** `.agent/workflows/` does not yet exist
- **WHEN** the user re-runs init through openspec-ui with the antigravity renderer selected
- **THEN** `installSkills` invokes the migration BEFORE the render loop
- **AND** every `.agents/workflows/*.md` file is moved to `.agent/workflows/<same-name>` (renderer's own output at `.agent/workflows/ithy-opsx-<cmd>.md` then lands alongside them)
- **AND** the empty `.agents/workflows/` directory is removed
- **AND** the empty `.agents/` directory is removed (only if truly empty — user files under `.agents/` outside `workflows/` are respected)
- **AND** `InstallResult.migrations` contains at least one entry with `cli: "antigravity"`, `moved: [".agents/workflows/opsx-propose.md", ".agents/workflows/opsx-apply.md"]`, and (if `kind` is present) `kind: "move"`

#### Scenario: migration skips on target-file conflict rather than clobbering
- **GIVEN** a project has BOTH `.agents/workflows/opsx-apply.md` (stale, from an older ithyno build) AND `.agent/workflows/opsx-apply.md` (newer, canonical output)
- **WHEN** the antigravity migration runs
- **THEN** the file at `.agents/workflows/opsx-apply.md` is NOT moved (it would overwrite the newer target)
- **AND** the migration reports it in `InstallResult.migrations[].skipped[]` with reason `"target exists"`
- **AND** the newer `.agent/workflows/opsx-apply.md` is untouched (byte-identical to before the migration ran)

#### Scenario: migration is idempotent — second run is a clean no-op
- **GIVEN** the migration has already run once against a project (all `.agents/workflows/*.md` have moved and `.agents/` was removed)
- **WHEN** `installSkills` is re-invoked (e.g., the user re-runs init)
- **THEN** the migration helper finds no `.agents/workflows/` directory
- **AND** returns `{ moved: [], skipped: [] }` without error
- **AND** `InstallResult.migrations[0]` still carries the antigravity entry (with the empty arrays), so callers can distinguish "ran and found nothing" from "was not invoked at all"

#### Scenario: migration honors dry-run
- **GIVEN** a project with `.agents/workflows/opsx-propose.md` present
- **WHEN** `installSkills` is invoked with `dryRun: true` and antigravity selected
- **THEN** the migration reports the planned move in `moved[]` (as if it had happened)
- **AND** `.agents/workflows/opsx-propose.md` remains on disk unmodified
- **AND** `.agent/workflows/opsx-propose.md` is NOT created

#### Scenario: agy init flattens nested ithyno workflows
- **GIVEN** an older ithyno install wrote `.agent/workflows/ithy-opsx/dispatch.md` or `.agents/workflows/ithy-opsx/dispatch.md`
- **WHEN** `installSkills` runs with antigravity selected
- **THEN** the workflow is moved to `.agent/workflows/ithy-opsx-dispatch.md`
- **AND** the empty nested source directory is removed
- **AND** the generated workflow uses Agy command references such as `/opsx-apply` and `/ithy-opsx-review`, not Claude colon syntax

#### Scenario: agy init copies legacy Claude commands into flat workflows
- **GIVEN** a project has `.claude/commands/ithy-opsx/dispatch.md` and `.claude/commands/ithy-opsx/merge.md` on disk (either hand-authored legacy or renderer output from a previous `[claude]` install)
- **AND** the corresponding flat Agy workflow files do not yet exist
- **WHEN** the user runs `installSkills` with antigravity selected
- **THEN** `installSkills` invokes the copy helper alongside the existing legacy-dir migration
- **AND** every `.claude/commands/ithy-opsx/*.md` file is COPIED to `.agent/workflows/ithy-opsx-<same-basename>`
- **AND** the source files at `.claude/commands/ithy-opsx/*` are unchanged (COPY, not move — Claude users of the same project unaffected)
- **AND** each target omits Claude's `name:` field and is recognized by its flat `/ithy-opsx-<command>` filename
- **AND** `InstallResult.migrations` gains a SECOND entry with `cli: "antigravity"`, `copied: [".claude/commands/ithy-opsx/dispatch.md", ".claude/commands/ithy-opsx/merge.md"]`, and `kind: "copy"`

#### Scenario: copy-from-claude skips on target-file conflict
- **GIVEN** `.claude/commands/ithy-opsx/dispatch.md` exists AND `.agent/workflows/ithy-opsx-dispatch.md` also already exists (e.g., because the antigravity renderer wrote it in the same install, or a prior copy step ran)
- **WHEN** the copy helper runs
- **THEN** the source file is NOT copied
- **AND** it appears in the entry's `skipped[]` with reason `"target exists"`
- **AND** both source and target files are byte-identical to their state before the helper ran

#### Scenario: copy-from-claude does not run when antigravity is not selected
- **GIVEN** a project has `.claude/commands/ithy-opsx/dispatch.md` present
- **WHEN** `installSkills` is invoked with only `[claude]` selected
- **THEN** the copy helper is NOT invoked
- **AND** `.agent/workflows/ithy-opsx-dispatch.md` is NOT created
- **AND** `InstallResult.migrations` contains no entry with `kind: "copy"` (nor any antigravity entry at all)
