## ADDED Requirements

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

The `.claude/commands/` and `.claude/skills/` directories SHALL become generated output, not committed source. The `.gitignore` SHALL exclude them (with an exception for renderer-emitted stub README files that explain their generated status). `templates/.claude/skills/` SHALL be removed once every skill it holds has a renderer path; the init scaffolder's `walkTemplates` SHALL skip `.claude/skills/` and defer to the renderer for that content.

The `server/init.test.ts` template-drift guard SHALL be updated to compare against renderer output rather than `templates/.claude/skills/`.

#### Scenario: fresh clone flow
- **GIVEN** a fresh `git clone` of the repo (no `.claude/`, no `.codex/`)
- **WHEN** the user runs `openspec init` and selects `[claude]`
- **THEN** `.claude/commands/opsx/propose.md` (and every other skill's claude output) is materialized
- **AND** the file matches the renderer's golden fixture for that source

#### Scenario: templates directory shrunk
- **GIVEN** the pilot skills (`opsx-propose`, `opsx-apply`) have renderers
- **WHEN** `templates/.claude/skills/opsx-propose/` and `templates/.claude/skills/opsx-apply/` are removed
- **THEN** `bin/init.js walkTemplates` skips those paths and defers to the renderer
- **AND** the init-scaffold-smoke-test still passes because the renderer emits equivalent files

### Requirement: openspec init invokes per-CLI renderers rather than blind template copy

The `openspec init` flow SHALL scaffold the project's skill surface by invoking the cross-CLI renderers for each user-selected CLI, rather than by copying a hardcoded `.claude/skills/` template tree verbatim. The renderer set is defined by `server/install-skills/renderers/index.ts` and aligns with the CLI enum documented above.

The init flow SHALL continue to copy CLI-neutral fixtures from `templates/` (e.g., `CLAUDE.md`, `openspec/README.md`) that do not depend on which CLI the user chose. `templates/.claude/skills/` SHALL be removed once every skill it holds has a renderer path.

#### Scenario: init emits per-CLI files based on selection
- **GIVEN** `openspec init` is invoked in a fresh directory
- **WHEN** the user selects `[claude, codex]`
- **THEN** `.claude/commands/` and `.codex/` (or Codex's equivalent path) are populated by their renderers
- **AND** `CLAUDE.md` is copied from `templates/CLAUDE.md` (CLI-neutral fixture)
- **AND** no legacy `templates/.claude/skills/` blind-copy occurs

#### Scenario: init preserves CLI-neutral fixtures
- **GIVEN** `openspec init` is invoked with any CLI selection
- **WHEN** the scaffolder walks `templates/`
- **THEN** files under `templates/.claude/skills/` are skipped by `walkTemplates`
- **AND** other `templates/` files (e.g. `CLAUDE.md`, `openspec/README.md`) are copied unchanged
