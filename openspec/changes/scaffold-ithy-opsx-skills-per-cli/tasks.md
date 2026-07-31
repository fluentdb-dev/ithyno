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

- [ ] 4.1 Delete `templates/.claude/commands/opsx/` and `templates/.claude/commands/ithy-opsx/`.
- [ ] 4.2 Delete `templates/.claude/skills/opsx-*/` and `templates/.claude/skills/ithy-opsx-*/`.
- [ ] 4.3 Update `bin/init.js`'s `walkTemplates` to explicitly skip `templates/.claude/commands/` and `templates/.claude/skills/` (defensive — even if a file leaks back, walk skips). Alternative: since the dirs are deleted, walk naturally skips; but the explicit filter documents intent for future contributors.
- [ ] 4.4 Update `scripts/verify-bundle.mjs` — drift guard's expected packaged-tarball file set no longer includes `templates/.claude/commands/{opsx,ithy-opsx}/*` or `templates/.claude/skills/{opsx-*,ithy-opsx-*}/*`.
- [ ] 4.5 Update `package.json`'s `files` list (if it enumerates those paths) to drop the removed subtrees. If it uses a directory-level pattern (`templates/**`), no change needed.

## 5. Tests

- [ ] 5.1 `server/init.test.ts` — for each supported CLI in `CLI_PRIORITY`, spin up a tmp dir, run `runInit({ managerCli, ... })`, assert:
  - Expected renderer output files exist at the CLI's declared paths
  - Files contain the skill's name/id (basic sanity, not full content)
  - No `templates/.claude/…` leaks (the removed paths do NOT appear in target)
- [ ] 5.2 Missing-renderer path: `runInit({ managerCli: "fake-cli", ... })` returns an error whose message names `fake-cli` AND lists supported renderers.
- [ ] 5.3 Undefined-managerCli path: `runInit({ managerCli: undefined, ... })` falls back to claude, produces the same output as `managerCli: "claude"`.
- [ ] 5.4 `server/new-project-chain.test.ts` — extend to pass `options.managerCli` through and assert per-CLI paths land.
- [ ] 5.5 Bundle drift-guard test: `scripts/verify-bundle.mjs`'s existing test-set update reflects the retirement.

## 6. Verification

- [ ] 6.1 `npm run openspec -- validate scaffold-ithy-opsx-skills-per-cli --strict` — passes.
- [ ] 6.2 `npm run typecheck` — clean.
- [ ] 6.3 `npm test` — all previously-passing tests still pass; new per-CLI scaffold tests green.
- [ ] 6.4 `npm run build` — web bundle builds; electron `tsc` clean.
- [ ] 6.5 **Manual smoke** on test-proj3 (fresh dir): pick `agy` in InitDialog → confirm antigravity's expected skill path is populated AND `.claude/` is NOT populated. Then in Manager PTY (agy), verify `/ithy-opsx:dispatch <some-change>` is discovered as a skill. Deferred to user — cannot exercise agy from this environment.
- [ ] 6.6 **Manual smoke** on Claude picker (regression): pick `claude` in a fresh dir → confirm existing `.claude/commands/opsx/*`, `.claude/commands/ithy-opsx/*`, `.claude/skills/ithy-opsx-*/` all still populate correctly.
- [ ] 6.7 **Manual smoke** on already-scaffolded test-proj (agy manager, pre-fix): re-run `openspec init` → confirm `.claude/` remains BUT antigravity path now also populated (idempotent add) OR document that user must remove `.claude/` manually.

## 7. Docs

- [ ] 7.1 Write `openspec/changes/scaffold-ithy-opsx-skills-per-cli/outcome.md` capturing what was landed, surprises, and follow-ups (Manager startup strategy for non-Claude CLIs, per-CLI renderer content polish).
- [ ] 7.2 Add a `docs/ideas/2026-XX-XX-per-cli-manager-startup-strategy.md` sketching the next piece (session-resume `--session-id` / `--resume` equivalents per CLI) — the immediate follow-up.
- [ ] 7.3 If any pre-existing archived-change docs referenced `.claude/…` scaffold as the sole path, add a soft-link back to this change acknowledging the retirement. Non-blocking — just for future readers.
