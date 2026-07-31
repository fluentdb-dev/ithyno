## MODIFIED Requirements

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

For every CLI in `server/doctor.ts::Cli` (`claude`, `codex`, `agy`, `copilot`, `gemini`, `opencode`, `cursor`, `antigravity`), the init flow SHALL EITHER invoke a renderer that materializes at least the two dispatch entry points (`opsx:propose` / `opsx:apply` at minimum) OR fail loudly with `"no renderer for <cli>; supported: <list>"` — silent mis-scaffolding (running init with agy and getting `.claude/` populated) is prohibited.

Migration for projects scaffolded before this change: those projects already have `.claude/commands/ithy-opsx/*` on disk even if their Manager isn't Claude. This change does NOT auto-migrate them. Recovery is to re-run `openspec init` on the same project directory (idempotent by design) OR manually remove stale `.claude/` entries and re-run.

#### Scenario: init emits per-CLI files based on selection
- **GIVEN** `openspec init` is invoked in a fresh directory
- **WHEN** the user selects `claude`
- **THEN** `.claude/commands/opsx/*`, `.claude/commands/ithy-opsx/*`, `.claude/skills/ithy-opsx-*/` are populated by the claude renderer
- **AND** `CLAUDE.md` is copied from `templates/CLAUDE.md` (CLI-neutral fixture)
- **AND** no `templates/.claude/…` blind-copy occurs for CLI-specific skill files
- **WHEN** the user instead selects `agy`
- **THEN** the antigravity renderer materializes the skill surface at antigravity's declared path (e.g. `.antigravity/…` per the renderer's declared output)
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
