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

- [ ] 2.1 **claude.ts** — extend existing renderer to cover ALL ithy-opsx skills (not just `opsx:propose` + `opsx:apply` from v1 pilot). Coverage list: `opsx:propose`, `opsx:apply`, `opsx:archive`, `opsx:revert`, `opsx:continue`, `opsx:answer`, `opsx:escalate`, `ithy-opsx:dispatch`, `ithy-opsx:dispatch-multi`, `ithy-opsx:apply`, `ithy-opsx:archive`, `ithy-opsx:merge`, `ithy-opsx:revert`, `ithy-opsx:answer`, `ithy-opsx:escalate`, `ithy-opsx:review`, `ithy-opsx:verify`, `ithy-opsx:import`.
- [ ] 2.2 **codex.ts** — new. Output path: whatever Codex expects (e.g. `.codex/…` per its own docs / openspec's `--tools codex` output). Verify by inspecting what `openspec init --tools codex` produces in a scratch dir; mirror the path convention for our skills.
- [ ] 2.3 **antigravity.ts** — new. Used by both `agy` and `antigravity` CLI keys (renderer resolver maps `agy → antigravity`). Output path from Antigravity docs.
- [ ] 2.4 **gemini.ts** — new. Output path from Gemini CLI docs / openspec convention.
- [ ] 2.5 **cursor.ts** — new. Output path is `.cursor/rules/<skill-id>.mdc` per common convention.
- [ ] 2.6 **opencode.ts** — new. Output path from opencode docs.
- [ ] 2.7 **github-copilot.ts** — new. Fragment-merge into `.github/copilot-instructions.md` per the renderer contract's fragment support.
- [ ] 2.8 Register all new renderers in `server/skill-renderer/renderers/index.ts`. Include the `agy → antigravity` alias in the resolver.

## 3. Renderer invocation from init

- [ ] 3.1 Add `renderSkillsForCli(managerCli, targetDir)` (or similar) in `server/skill-renderer/index.ts` that: resolves the renderer for `managerCli`, iterates the universal skill source at `ithyno/skills/*`, and emits per-CLI output.
- [ ] 3.2 On missing renderer for the passed `managerCli`, THROW a named error: `"No skill renderer for '<cli>'. Supported: <list>. Add server/skill-renderer/renderers/<cli>.ts or pick one of the supported CLIs."` NO silent claude fallback.
- [ ] 3.3 Call `renderSkillsForCli(managerCli, targetDir)` from `runInit` AFTER the `walkTemplates` copy step (so any static fixtures land first, then the renderer emits per-CLI content).
- [ ] 3.4 Renderer output is idempotent — re-running init overwrites existing files at the emitted paths (matches `copyFile({ force: true })` semantics for the CLI-neutral fixtures).

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
