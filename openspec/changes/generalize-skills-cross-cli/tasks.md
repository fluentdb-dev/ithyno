# Tasks

## 1. Universal skill source layout

- [ ] 1.1 Create `ithyno/skills/` directory. Add a `README.md` at its root explaining "these are the CLI-neutral skill sources; per-CLI files are generated at install time — do not hand-edit `.claude/commands/`, `.codex/`, `.cursor/`, etc."
- [ ] 1.2 Define the `manifest.yaml` JSON schema (`schemas/skill-manifest.schema.json`) — `name`, `namespace`, `command`, `description`, `supports` (enum of CLI ids), `capabilities_required`, `per_cli` map for overrides.
- [ ] 1.3 Add a vitest that validates every `ithyno/skills/*/manifest.yaml` against the schema.

## 2. Capability token vocabulary (v1 minimal set)

- [ ] 2.1 Document the three v1 tokens in `docs/skill-capabilities.md`:
  - `<capability:subagent_spawn>` — launch a sub-worker with a prompt.
  - `<capability:file_write>` — modify project files.
  - `<capability:bash>` — shell out.
- [ ] 2.2 Add a linter (`scripts/lint-skill-tokens.mjs`) that scans `ithyno/skills/**/SKILL.md` for unknown tokens and rejects them.

## 3. Pilot skill: `opsx-propose`

- [ ] 3.1 Extract the current `.claude/commands/opsx/propose.md` body into `ithyno/skills/opsx-propose/SKILL.md`, replacing Claude-specific phrasing (Task tool, /opsx:propose invocation) with capability tokens.
- [ ] 3.2 Write `ithyno/skills/opsx-propose/manifest.yaml` — namespace `opsx`, command `propose`, `supports: [claude, codex]` (v1 pilot).

## 4. Renderer infrastructure

- [ ] 4.1 Create `server/install-skills.ts` exposing `installSkills({ projectRoot, selectedClis, sources, dryRun }) → { written, skipped, errors }`.
- [ ] 4.2 Renderer registry: `server/install-skills/renderers/index.ts` maps CLI id → renderer module.
- [ ] 4.3 Renderer interface: `render(source: SkillSource, ctx: RenderContext) → RenderedFile[]` where each file has `path` (relative to projectRoot), `content`, and `mode` (`create | overwrite | fragment-merge`).
- [ ] 4.4 Fragment-merge helper — for renderers like Copilot that write into a shared file, provide idempotent section replacement using `<!-- ithyno:skill:<id>:start -->` / `:end -->` delimiters.

## 5. Renderer: `claude`

- [ ] 5.1 `server/install-skills/renderers/claude.mjs` — emits `.claude/commands/<namespace>/<command>.md`. Body: renders SKILL.md's capability tokens into Claude-native invocation (Task tool for `subagent_spawn`, etc.).
- [ ] 5.2 Also emits `.claude/skills/<skill-id>/SKILL.md` when the manifest requests it (some flows benefit from having both a slash-command wrapper and a discoverable skill).
- [ ] 5.3 Vitest: golden fixture — given a fixed source, asserts exact rendered bytes for both output files.

## 6. Renderer: `codex`

- [ ] 6.1 Research Codex's current prompt/command surface convention (write findings to `docs/cli-research/codex.md`).
- [ ] 6.2 `server/install-skills/renderers/codex.mjs` — emits Codex's native format based on research.
- [ ] 6.3 Vitest: golden fixture.

## 7. Install-time CLI selection

- [ ] 7.1 Extend `bin/init.js` (or the init flow it uses) with a CLI-selection prompt after project-root determination. Options come from the renderer registry (task 4.2).
- [ ] 7.2 Reuse `runDoctor()` (`server/doctor.ts`) to detect installed CLIs. Dim / auto-exclude uninstalled options in the picker; allow the user to override ("install anyway").
- [ ] 7.3 Pass selected CLI set to `installSkills()` (task 4.1).
- [ ] 7.4 Emit a per-CLI summary at the end: "Wrote 5 files for `claude`, 5 for `codex`. Skipped `cursor` (not selected)."

## 8. Idempotent re-install

- [ ] 8.1 Add `openspec init --skills-only` flag (or `openspec init` when `openspec/` already exists) that runs only the skill install phase.
- [ ] 8.2 On re-run with a different CLI set, orphan files from the previous set SHALL be removed. Track prior state via `.ithyno/install-state.json` at the project root.
- [ ] 8.3 On re-run with the same CLI set, output bytes MUST match — no touching mtimes if content unchanged.
- [ ] 8.4 Vitest — set A → re-install with set B → assert A's files gone, B's files present.

## 9. Migration of existing surface

- [ ] 9.1 Add `.claude/commands/` and `.claude/skills/` to `.gitignore` (with exceptions for the README stub the renderer emits).
- [ ] 9.2 Remove `templates/.claude/skills/` (once renderers cover its content). Keep `templates/CLAUDE.md` and any other CLI-neutral fixtures.
- [ ] 9.3 Update `bin/init.js` walkTemplates to skip `.claude/skills/` — those come from the renderer path.
- [ ] 9.4 Update `server/init.test.ts`'s template-drift guard to compare against renderer output instead of `templates/.claude/skills/`.

## 10. Drift guard

- [ ] 10.1 Vitest at `server/install-skills-drift.test.ts` — runs the install in dry-run mode against the current committed universal sources and diffs the resulting output against what's on disk under `.claude/`, `.codex/`, etc. (for the CLIs whose files ARE committed per team preference).
- [ ] 10.2 The drift test SHALL name the offending file and delta when it fails, so a contributor knows to re-run install rather than hand-edit.

## 11. Docs

- [ ] 11.1 `docs/skills/authoring.md` — how to add a new skill: create `ithyno/skills/<name>/`, write SKILL.md with capability tokens, write manifest.yaml, run `openspec init --skills-only --dry-run --diff` to preview per-CLI output.
- [ ] 11.2 `docs/skills/renderer-authoring.md` — how to add a new CLI renderer.
- [ ] 11.3 `docs/adr/YYYY-MM-DD-generalize-skills-cross-cli.md` — captures the D1-D7 decisions from design.md as an accepted ADR.

## 12. CLI research (per-CLI, spun out to follow-up changes as scope demands)

- [ ] 12.1 Codex surface — done as part of task 6.1.
- [ ] 12.2 Antigravity surface — spun out to follow-up change.
- [ ] 12.3 Cursor surface — spun out to follow-up change.
- [ ] 12.4 Gemini surface — spun out to follow-up change.
- [ ] 12.5 Copilot surface + fragment-merge specifics — spun out to follow-up change.
- [ ] 12.6 Opencode surface — spun out to follow-up change.

## 13. Verification

- [ ] 13.1 `npm test` — every renderer's golden fixtures pass; drift guard passes.
- [ ] 13.2 `npm run typecheck` clean.
- [ ] 13.3 `npm run openspec -- validate generalize-skills-cross-cli --strict` passes.
- [ ] 13.4 Manual: fresh tmpdir → `npm run openspec -- init` there → pick `claude` only → verify `.claude/commands/opsx/propose.md` exists and matches golden. Repeat with `codex` only, then both.
- [ ] 13.5 Manual: in a Claude Code session opened on the tmpdir, invoke `/opsx:propose "test"` → confirms the rendered slash command loads and runs the same as before this change.
- [ ] 13.6 Write `openspec/changes/generalize-skills-cross-cli/outcome.md`.
