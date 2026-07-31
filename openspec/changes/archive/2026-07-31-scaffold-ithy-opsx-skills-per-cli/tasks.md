# Tasks

## 1. Wire `managerCli` through init callers

- [x] 1.1 Extend `runInit` in `bin/init.js` to accept `managerCli` option (string). When undefined, default to `"claude"` at the renderer-invocation call site — keeps the bare-CLI workflow working.
- [x] 1.2 Update `bin/init.d.ts` to match the new option.
- [x] 1.3 Extend `runNewProjectChain` in `bin/new-project-chain.js` to forward `options.managerCli` into its inner `runInit` call (currently the chain only uses `managerCli` for the openspec-init `--tools` mapping — extend to also feed the ithyno-side scaffold).
- [x] 1.4 `server/index.ts` `/api/init` — pass `chosenCli` (from `resolveManagerFromDoctor`) as `managerCli` when calling into the chain. Already done by `a48ed8d` for chain-level; task 1.3 forwards it further into `runInit`.
- [x] 1.5 `server/index.ts` `/api/init/stream` — pass extracted `body.manager.command` (same shape check as `/api/init`) as `managerCli`. Already done by `a48ed8d` for chain-level; task 1.3 forwards it further into `runInit`.
- [x] 1.6 `server/init.test.ts` — add regression tests: `runInit({ managerCli: "claude" | undefined | "agy", ... })` all succeed (option accepted, not silently dropped by destructuring regression). Full renderer output assertion lands with task 3+2.1 (needs renderer wiring).

## 2. Ship all missing renderers

Each renderer at `server/skill-renderer/renderers/<cli>.ts` implements the shared `SkillRenderer` contract from `server/skill-renderer/types.ts`. Each writes the ithy-opsx skill surface at the CLI's expected discovery path, sourced from `ithyno/skills/<name>/{SKILL.md, manifest.yaml}`.

- [ ] 2.1 **claude.ts** — extend existing renderer to cover ALL ithy-opsx skills. Deferred: universal skill sources currently only have `ithy-opsx-apply`. Porting all `opsx:*` / `ithy-opsx:*` skills to universal format is a separate sub-task (large per-skill effort). Renderers are ready to consume additional sources when they land.
- [x] 2.2 **codex.ts** — MVP shipped. Path `.codex/prompts/<ns>-<cmd>.md`. Token expansions Codex-friendly (subprocess shell).
- [x] 2.3 **antigravity.ts** — MVP shipped. Path `.antigravity/skills/<ns>-<cmd>/SKILL.md`. Used by both `agy` and `antigravity` doctor CLIs via `mapDoctorCliToRendererCli`.
- [x] 2.4 **gemini.ts** — MVP shipped. Path `.gemini/commands/<ns>-<cmd>.md`.
- [x] 2.5 **cursor.ts** — MVP shipped. Path `.cursor/rules/<ns>-<cmd>.mdc` with `alwaysApply: false` frontmatter.
- [x] 2.6 **opencode.ts** — MVP shipped. Path `.opencode/prompts/<ns>-<cmd>.md`.
- [x] 2.7 **copilot.ts** — MVP shipped as `.github/prompts/<ns>-<cmd>.md`. Fragment-merge into `.github/copilot-instructions.md` (deferred — per-file discoverable already covers the practical case).
- [x] 2.8 Registered all 6 new renderers in `server/skill-renderer/renderers/index.ts`. Added `mapDoctorCliToRendererCli` helper for the `agy → antigravity` alias + re-exported from top-level `server/skill-renderer/index.ts`. Pilot skill's `supports:` list extended to all 7 CLIs so the renderers actually get a source to consume.

## 3. Renderer invocation from init

- [x] 3.1 Existing `installSkills()` from `server/skill-renderer/index.ts` already provides this — iterates sources, resolves renderer, emits per-CLI output. Reused directly rather than adding a wrapper.
- [x] 3.2 Existing `installSkills()` returns `result.errors[]` per missing renderer with message `no renderer registered for <cli> (available: <list>)` — no throw, but structured error surfaces to caller. Server-side wrap logs the warning; UI can render it. Deferred: promoting missing-renderer to a hard error (openspec-init-fatal-fail) is a policy choice — MVP treats it as non-fatal warning so a mis-mapped CLI doesn't fully break init.
- [x] 3.3 Wired in `server/index.ts` — both `/api/init` and `/api/init/stream` call `installSkills({...})` after `runNewProjectChain` completes. Reads `ithyno/skills/` from `PKG_ROOT`. Non-fatal wrap logs warnings. runInit's `managerCli` option (from task 1) is not the invocation site — server layer above runInit is; this keeps bin/ithyno CLI (pure JS) decoupled from server TS.
- [x] 3.4 `installSkills()` already emits with `mode: create` — files overwrite existing. Verified by v1 pilot semantics.

## 4. Retire `templates/.claude/{commands,skills}/` per D4 ordering

- [ ] 4.1 Delete `templates/.claude/commands/opsx/` and `templates/.claude/commands/ithy-opsx/`. **Deferred**: gated on task 2.1 (all skills ported to universal source). Only `ithy-opsx-apply` exists in `ithyno/skills/` today — deleting the templates while other skills only live there would break Claude scaffold.
- [ ] 4.2 Delete `templates/.claude/skills/opsx-*/` and `templates/.claude/skills/ithy-opsx-*/`. **Deferred**: same reason as 4.1.
- [ ] 4.3 Update `bin/init.js`'s `walkTemplates` skip filter. **Deferred**: no need until 4.1/4.2 execute — walkTemplates naturally handles empty dirs.
- [ ] 4.4 Update `scripts/verify-bundle.mjs`. **Deferred**: paired with 4.1/4.2.
- [ ] 4.5 Update `package.json`'s `files` list. **Deferred**: paired with 4.1/4.2. Currently uses `templates/**` pattern so no immediate change.

## 5. Tests

- [x] 5.1 `server/skill-renderer.test.ts` — new "installSkills per-CLI end-to-end" describe block loops through the 6 non-Claude CLIs, materializes the pilot skill on disk, and asserts CLI-declared paths land with correct content. Also covers multi-CLI selection (writes to `.claude/`, `.antigravity/`, `.cursor/rules/` simultaneously). runInit-level per-CLI test deferred until task 2.1 (real per-skill sources) makes it meaningful.
- [x] 5.2 Missing-renderer path — covered at `installSkills` level: cast `"bogus-cli"` as CliId, assert `result.errors[0].message` names the bogus CLI + lists available renderers. Fail-loud policy at the runInit level (`installSkills` currently returns errors non-fatally) is a follow-up.
- [x] 5.3 Undefined-managerCli path — `runInit({ managerCli: undefined, ... })` regression test added in task 1.6 confirms option is accepted. Full "produces same output as claude" assertion deferred until 2.1 makes render output actually observable via runInit.
- [ ] 5.4 `server/new-project-chain.test.ts` per-CLI paths. **Deferred**: current chain tests are structural (does chain complete, do events fire); extending to per-CLI assertions requires network-heavy `openspec init` per CLI. The e2e per-CLI tests in 5.1 cover the same output shape more cheaply.
- [ ] 5.5 Bundle drift-guard test update. **Deferred**: paired with task 4 retirement.

## 6. Verification

- [x] 6.1 `npm run openspec -- validate scaffold-ithy-opsx-skills-per-cli --strict` — passes.
- [x] 6.2 `npm run typecheck` — clean.
- [x] 6.3 `npm test` — 669 pass / 1 skipped (up from 646 pre-change). +23 tests, all new per this change.
- [x] 6.4 Skipped `npm run build` in this iteration — server / renderer changes only, no web-side bundle impact. tsx-run server picks up TS directly.
- [ ] 6.5 **Manual smoke** on test-proj3 (fresh dir) with agy picker. **Deferred to user** — cannot exercise agy from this environment.
- [ ] 6.6 **Manual smoke** on Claude picker regression. **Deferred to user** — Claude renderer unchanged from v1 pilot, existing e2e tests cover the renderer's output; running end-to-end requires Electron / server.
- [ ] 6.7 **Manual smoke** on pre-fix scaffolded test-proj (agy). **Deferred to user** — same environment constraint.

## 7. Docs

- [x] 7.1 Wrote `openspec/changes/scaffold-ithy-opsx-skills-per-cli/outcome.md` — 4 sections (Worked / Surprises / Differently / Follow-ups).
- [ ] 7.2 `docs/ideas/YYYY-MM-DD-per-cli-manager-startup-strategy.md` idea capture. **Deferred**: listed as follow-up in outcome.md; will graduate to a docs/ideas file when the next contributor picks it up.
- [ ] 7.3 Soft-link from archived-change docs. **Deferred**: non-blocking, no reader-impact.
