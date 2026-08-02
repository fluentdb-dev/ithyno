## MODIFIED Requirements

### Requirement: openspec init invokes per-CLI renderers rather than blind template copy

The `openspec init` flow SHALL scaffold the project's skill surface by invoking the cross-CLI renderers for each user-selected CLI, rather than by copying a hardcoded `.claude/` template tree verbatim. The renderer set is defined by `server/skill-renderer/renderers/index.ts` and aligns with the CLI enum documented above.

The init flow SHALL continue to copy CLI-neutral fixtures from `templates/` (e.g., `CLAUDE.md`, `openspec/README.md`, `agents.yaml.tmpl`, `.gitignore` maintenance) that do not depend on which CLI the user chose. `templates/.claude/commands/` AND `templates/.claude/skills/` SHALL both be removed once every skill they hold has a working renderer path.

`bin/init.js`'s `runInit` SHALL accept the chosen Manager CLI (`managerCli` option or equivalent) and pass it to renderer invocation. The `resolveManagerFromDoctor` result (already computed in the HTTP init flow) is the source of truth for which CLI to render. If no CLI is passed (e.g. a bare `bin/ithyno init` CLI invocation), the flow SHALL fall back to `"claude"` to keep single-user CLI workflows working without a picker.

For every CLI in `server/doctor.ts::Cli` (`claude`, `codex`, `agy`, `copilot`, `gemini`, `opencode`, `cursor`, `antigravity`), the init flow SHALL EITHER invoke a renderer that materializes at least the currently-ported ithy-opsx skills (baseline: `ithy-opsx-apply` and `ithy-opsx-dispatch` as of `port-ithy-opsx-dispatch-to-universal-source`) OR fail loudly with `"no renderer for <cli>; supported: <list>"` — silent mis-scaffolding (running init with agy and getting `.claude/` populated) is prohibited.

Migration for projects scaffolded before this change: those projects already have `.claude/commands/ithy-opsx/*` on disk even if their Manager isn't Claude. This change does NOT auto-migrate them. Recovery is to re-run `openspec init` on the same project directory (idempotent by design) OR manually remove stale `.claude/` entries and re-run.

The set of ported universal skills under `ithyno/skills/` grows over time as ithy-opsx surface is migrated from `.claude/commands/*.md` (hand-authored, Claude-only) to `ithyno/skills/*/SKILL.md + manifest.yaml` (universal + rendered). Renderers pick up new sources automatically — no renderer-side code change is required when a new skill is ported.

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

#### Scenario: init emits every ported ithy-opsx skill per selected CLI
- **GIVEN** `ithyno/skills/` contains `ithy-opsx-apply` and `ithy-opsx-dispatch` (baseline coverage as of this change)
- **WHEN** `openspec init` is invoked and the user selects any CLI (e.g. `agy`)
- **THEN** the renderer emits BOTH skills at the CLI's declared paths (e.g. `.antigravity/skills/ithy-opsx-apply/SKILL.md` AND `.antigravity/skills/ithy-opsx-dispatch/SKILL.md`)
- **AND** the emitted files each carry the `GENERATED FILE — do not hand-edit` banner sourcing back to `ithyno/skills/<id>/`
