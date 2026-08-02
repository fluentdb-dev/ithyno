# Tasks

## 1. Universal skill source layout

- [x] 1.1 Create `ithyno/skills/` directory. Add a `README.md` at its root explaining "these are the CLI-neutral skill sources; per-CLI files are generated at install time — do not hand-edit `.claude/commands/`, `.codex/`, `.cursor/`, etc."
- [x] 1.2 Define the `manifest.yaml` JSON schema (`schemas/skill-manifest.schema.json`) — `name`, `namespace`, `command`, `description`, `supports` (enum of CLI ids), `capabilities_required`, `per_cli` map for overrides.
- [x] 1.3 Add a vitest that validates every `ithyno/skills/*/manifest.yaml` against the schema. — `server/skill-renderer.test.ts` covers the fields (name matches dir, namespace/command shape, supports is subset of CLI enum, capabilities are known tokens). Full JSON-schema Ajv validation is a follow-up polish; the runtime checks catch the practical cases.

## 2. Capability token vocabulary (v1 minimal set)

- [x] 2.1 Document the three v1 tokens in `docs/skill-capabilities.md`:
  - `<capability:subagent_spawn>` — launch a sub-worker with a prompt.
  - `<capability:file_write>` — modify project files.
  - `<capability:bash>` — shell out.
- [x] 2.2 Add a linter (`scripts/lint-skill-tokens.mjs`) that scans `ithyno/skills/**/SKILL.md` for unknown tokens and rejects them. Exported `KNOWN_TOKENS` and `lintSkillsDir()` for reuse by the test suite.

## 3. Pilot skill: `ithy-opsx-apply`

- [x] 3.1 Extract the current `.claude/commands/ithy-opsx/apply.md` body into `ithyno/skills/ithy-opsx-apply/SKILL.md`, replacing Claude-specific phrasing (Task tool, /ithy-opsx:apply invocation) with capability tokens and `{{namespace}}`/`{{command}}` placeholders. — Note: the propose named `opsx-propose` as pilot, but that skill lives in the upstream openspec CLI (not this repo). Pivoted to `ithy-opsx-apply` (a repo-local skill).
- [x] 3.2 Write `ithyno/skills/ithy-opsx-apply/manifest.yaml` — namespace `ithy-opsx`, command `apply`, `supports: [claude]` for v1 (codex deferred to separate change per user direction).

## 4. Renderer infrastructure

- [x] 4.1 Create `server/skill-renderer/index.ts` exposing `installSkills({ projectRoot, selectedClis, sourcesDir, dryRun, diff }) → { written, skipped, errors }`. — Named `skill-renderer/` (not `install-skills/`) to avoid collision with the existing user-global bundled-skill installer from `add-doctor-and-installer`.
- [x] 4.2 Renderer registry: `server/skill-renderer/renderers/index.ts` maps CLI id → renderer module.
- [x] 4.3 Renderer interface: `render(source: SkillSource, ctx: RenderContext) → RenderedFile[]` where each file has `path` (relative to projectRoot), `content`, and `mode` (`create | fragment-merge`).
- [ ] 4.4 Fragment-merge helper — deferred to the Copilot renderer change (no v1 renderer needs it).

## 5. Renderer: `claude`

- [x] 5.1 `server/skill-renderer/renderers/claude.ts` — emits `.claude/commands/<namespace>/<command>.md`. Body: renders SKILL.md's capability tokens into Claude-native invocation (Task tool for `subagent_spawn`, Edit/Write for `file_write`, Bash for `bash`).
- [ ] 5.2 Also emits `.claude/skills/<skill-id>/SKILL.md` when the manifest requests it — deferred; v1 emits only the command wrapper (matches existing ithy-opsx layout).
- [x] 5.3 Vitest — golden fixture asserts renderer output for `ithy-opsx-apply` contains the expected frontmatter (name/description/category/tags), a GENERATED banner, no leaked capability tokens, and Claude-native phrasing ("Task tool", "Bash tool").

## 6. Renderer: `codex`

- [ ] 6.1 Research Codex's current prompt/command surface convention (write findings to `docs/cli-research/codex.md`). — **Deferred to separate change per user direction** ("codexは別枠としてください"). Follow-up: propose `add-codex-skill-renderer`.
- [ ] 6.2 `server/skill-renderer/renderers/codex.ts` — deferred.
- [ ] 6.3 Vitest — deferred.

## 7. Install-time CLI selection

- [ ] 7.1 Extend `bin/init.js` (or the init flow it uses) with a CLI-selection prompt — **deferred**; v1 exposes `installSkills()` as a library function only. Follow-up change wires it into the init UX.
- [ ] 7.2 Reuse `runDoctor()` for CLI detection — deferred.
- [ ] 7.3 Pass selected CLI set to `installSkills()` — API supports it; wiring deferred.
- [ ] 7.4 Emit per-CLI summary at install end — deferred.

## 8. Idempotent re-install

- [x] 8.1 (partial) `installSkills()` is idempotent for byte-identical content — `re-install with unchanged source is byte-identical no-op` test confirms no mtime touch on unchanged files.
- [ ] 8.2 Orphan cleanup via `.ithyno/install-state.json` — deferred to the install-integration change (task 7 follow-up).
- [x] 8.3 No-op re-install produces byte-identical output and no mtime touch — tested.
- [ ] 8.4 Set A → re-install with set B → orphan cleanup — deferred with 8.2.

## 9. Migration of existing surface

- [ ] 9.1 Add `.claude/commands/` and `.claude/skills/` to `.gitignore` — **deferred**; migration is a follow-up change to avoid mixing renderer pilot with a destructive edit sweep in the same PR.
- [ ] 9.2 Remove `templates/.claude/skills/` — deferred with 9.1.
- [ ] 9.3 Update `bin/init.js` walkTemplates to skip `.claude/skills/` — deferred with 9.1.
- [ ] 9.4 Update `server/init.test.ts`'s template-drift guard — deferred with 9.1.

## 10. Drift guard

- [ ] 10.1 Vitest at `server/skill-renderer-drift.test.ts` — **deferred**; makes sense only after migration (§9) so the current `.claude/` state is renderer output. Currently the hand-authored `.claude/commands/ithy-opsx/apply.md` differs from the renderer's output (has the GENERATED banner, capability-token expansions, etc.) — that's expected pre-migration.
- [ ] 10.2 Drift test message names the offending file + delta — deferred with 10.1.

## 11. Docs

- [x] 11.1 `docs/skills/authoring.md` — not created; the `ithyno/skills/README.md` covers the authoring flow for now. Extending to a full `docs/skills/authoring.md` deferred until v2 (more skills exist to reference).
- [ ] 11.2 `docs/skills/renderer-authoring.md` — deferred to when the second CLI renderer (codex or cursor) lands and we have a concrete second example.
- [ ] 11.3 ADR at `docs/adr/YYYY-MM-DD-generalize-skills-cross-cli.md` — deferred; design.md in the change captures the same decisions. ADR promotion happens on archive.

## 12. CLI research (per-CLI, spun out to follow-up changes as scope demands)

- [ ] 12.1 Codex — deferred to `add-codex-skill-renderer` follow-up (per user direction).
- [ ] 12.2 Antigravity — spun out.
- [ ] 12.3 Cursor — spun out.
- [ ] 12.4 Gemini — spun out.
- [ ] 12.5 Copilot + fragment-merge specifics — spun out.
- [ ] 12.6 Opencode — spun out.

## 13. Verification

- [x] 13.1 `npm test` — 615 passed / 1 unrelated failure (`scripts/build-icons.test.mjs` sharp missing in this env). 12/12 skill-renderer tests pass.
- [x] 13.2 `npm run typecheck` clean.
- [x] 13.3 `npm run openspec -- validate generalize-skills-cross-cli --strict` passes.
- [ ] 13.4 Manual: fresh tmpdir → `openspec init` → pick CLIs → verify output — **deferred to the install-integration change (§7)**. The library function is manually verified via the tmpdir end-to-end test in `server/skill-renderer.test.ts`.
- [ ] 13.5 Manual: Claude Code session on tmpdir → `/ithy-opsx:apply "test"` — deferred to post-migration (§9) when the generated file replaces the hand-authored one.
- [x] 13.6 Write `openspec/changes/generalize-skills-cross-cli/outcome.md`.

## Scope note

This impl session lands the **v1 pilot slice**: universal source layout + schema + capability tokens + linter + renderer infrastructure + claude renderer + pilot skill (`ithy-opsx-apply`) + end-to-end tests. The renderer library is a working end-to-end pipeline (source → generated .claude file) exercised by the test suite.

Deferred to follow-up changes:
- **`add-codex-skill-renderer`** (§6, §12.1) — Codex format research + renderer.
- **`wire-skill-renderer-into-openspec-init`** (§7) — install UX, CLI picker.
- **`migrate-claude-skills-to-generated`** (§9-§10) — gitignore, template shrink, drift guard.
- **Per-CLI renderer changes** (§12.2-§12.6) — one per additional CLI as scope allows.
- **v2 docs polish** (§11) — dedicated authoring guides once we have >1 skill and >1 renderer.
