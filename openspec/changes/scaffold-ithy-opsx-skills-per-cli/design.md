## Context

`generalize-skills-cross-cli` v1 (archived 2026-07-29) established:
- Universal skill source at `ithyno/skills/<name>/{SKILL.md, manifest.yaml}`
- Renderer contract in `server/skill-renderer/types.ts`
- Per-CLI renderer at `server/skill-renderer/renderers/claude.ts` (only claude shipped so far)
- Renderer discovery in `server/skill-renderer/discover.ts`
- Top-level entry in `server/skill-renderer/index.ts`

What's missing (this change's territory):
- `bin/init.js` still calls `walkTemplates(TEMPLATES_DIR)` uniformly, copying `templates/.claude/commands/*` and `templates/.claude/skills/*` regardless of Manager
- `runInit` has no `managerCli` parameter; the HTTP layer (`init-handler.ts::resolveManagerFromDoctor`) computes `chosenCli` but doesn't pass it forward to init
- No renderer for any non-Claude CLI (`codex`, `agy`, `copilot`, `gemini`, `opencode`, `cursor`, `antigravity`)
- The templates trees still contain the Claude-shaped skill scaffolds — they'd need to be removed after renderer coverage is complete, else the blind copy + renderer output collide

Concrete blocker documented in proposal.md: agy pickers get a Claude-shaped `.claude/` scaffold and no `.agy/` (or equivalent) skill surface, so agy can't discover `/ithy-opsx:dispatch`. See proposal.md's Why for the full symptom.

## Goals / Non-Goals

**Goals:**
- `runInit` and `runNewProjectChain` accept and forward `managerCli`.
- Every CLI in the `Cli` enum gets EITHER a working renderer OR init hard-fails with a named error (no silent mis-scaffold).
- `templates/.claude/commands/{opsx,ithy-opsx}/*` and `templates/.claude/skills/*/` deleted from the shipped package; `walkTemplates` no longer touches them.
- The two dispatch entry points (`opsx:propose`, `opsx:apply`) plus the ithy-opsx family (`dispatch`, `apply`, `archive`, `merge`, `revert`, `answer`, `escalate`, `dispatch-multi`, `verify`, `review`, `import`) render correctly for every supported CLI OR the CLI is explicitly listed as "renderer TBD, init errors" until it's covered.
- `verify-bundle.mjs` drift guard updated.

**Non-Goals:**
- Auto-migration of existing pre-fix scaffolded projects (documented workaround: re-run init).
- Manager startup strategy for non-Claude CLIs (session-resume). Separate follow-up.
- New skills / new capabilities. This change is purely wiring existing skills through renderers.
- Repo's own `.claude/` (top-level) gets no changes — dev workflow uses Claude Code, keep the committed copy.
- Renderer *content* fidelity for non-Claude CLIs beyond "the file lands at the CLI's expected path with valid syntax". Getting each CLI's slash-command/skill format perfectly right may need per-CLI polish PRs later — this change ships the plumbing + at least a documented minimum.

## Decisions

### D1 — `managerCli` flows through as a plain option, not a required arg

`runInit({ targetDir, ..., managerCli? })` accepts an optional string. When undefined, default to `"claude"` (preserves single-user CLI workflow that predates the picker). Callers:

- `bin/ithyno.js init` CLI: no `--manager` flag today. Leave as-is (falls back to claude).
- `server/index.ts::/api/init` and `/api/init/stream`: pass `chosenCli` (already resolved by `resolveManagerFromDoctor` or the SSE body's `manager.command`).
- `bin/new-project-chain.js::runNewProjectChain(target, onEvent, { managerCli })`: already threading `managerCli` for the openspec-init `--tools` call (from `a48ed8d`). Extend to also pass to `runInit`.

Rationale: minimal surface change. `runInit`'s existing shape stays intact; the new option is additive. Undefined-defaults-to-claude keeps every existing caller working without a rewrite.

**Alternative rejected**: making `managerCli` required. Would break every existing CLI invocation and force upstream callers (VS Code extension, tests) to compute it. Not worth it for a rescue-hatch default.

### D2 — Renderer dispatch: fail loud on missing coverage, no silent claude fallback

`runInit`'s renderer step calls something like `renderSkillsForCli(managerCli, target)`. If no renderer is registered for `managerCli`, throw an error whose message names the missing CLI and lists what IS supported:

```
No skill renderer for 'agy'. Supported: claude.
Add a renderer at server/skill-renderer/renderers/agy.ts,
or pick one of the supported CLIs.
```

This is stricter than the openspec CLI's `--tools` fallback (which defaults to claude on unknown input). Different rationale: openspec `--tools` mis-mapping only affects the CLI's AGENTS.md format (still usable, just wrong dialect); a mis-mapped skill scaffold is silently broken (the user's picked Manager has no discovery path). Loud failure at init time is better than silent breakage at Kanban Start time.

**Alternative rejected**: default to claude renderer for unknown CLIs. Would recreate the exact bug this change is fixing.

### D3 — Renderer shipment scope: claude first-class, others "at least the discovery path exists" MVP

The v1 pilot only shipped `claude.ts`. Implementing all 7 remaining renderers to full fidelity in this change would be a multi-week effort. Split:

- **claude.ts**: existing; extended to cover ALL ithy-opsx skills (not just opsx-propose / opsx-apply from v1).
- **codex.ts, antigravity.ts (used by agy), gemini.ts, cursor.ts, opencode.ts**: SHIP as part of this change. Each writes at LEAST the two dispatch entry points (`opsx:propose`, `opsx:apply`) to the CLI's declared skill path. Content fidelity may be minimum-viable (portable markdown copied with per-CLI headers), enough that the CLI discovers the slash command / skill.
- **github-copilot.ts**: fragment-merge into `.github/copilot-instructions.md`. Renderer contract already supports fragment merge per the v1 spec.
- **agy alias**: `agy` is Antigravity's CLI name. Renderer resolution maps `managerCli === "agy"` → `antigravity.ts`. `agents.yaml` still writes `command: agy` (unchanged).

Each renderer's per-CLI expected path comes from the CLI's own docs (or `openspec init --tools <t>`'s output as a reference — openspec already knows where each CLI reads). During impl, each renderer's target path is documented at the top of its file with a link back to the source-of-truth.

**Alternative rejected**: ship only claude + one non-claude (agy) and mark the rest as "TODO, init errors". Would defer the whole point of this change (non-Claude Managers still don't work) without much saved effort — each renderer is small (map source → target format + write).

### D4 — Template retirement: delete after render coverage is proven

Order of operations to avoid a broken intermediate state:

1. Ship all renderers (D3).
2. Extend `server/init.test.ts` (or a new smoke test) to run init for EACH supported CLI and assert the expected files land — one test per CLI.
3. Once all tests green, delete `templates/.claude/commands/opsx/`, `templates/.claude/commands/ithy-opsx/`, `templates/.claude/skills/opsx-*`, `templates/.claude/skills/ithy-opsx-*`.
4. Update `walkTemplates` filter to skip those paths (belt-and-suspenders: even if some file leaks back in, walk skips).
5. Update `scripts/verify-bundle.mjs` — drift guard no longer expects those files under the packaged tarball.
6. Update `distribute-ithy-opsx` archived-change docs (soft — link back to this change as the "final piece" they promised).

**Alternative rejected**: delete templates first, add renderers second. Would break every user of `openspec init` in the intermediate commits. Order: renderers first, verification second, deletion third.

### D5 — Repo's own `.claude/` is untouched

The top-level `.claude/commands/opsx/`, `.claude/commands/ithy-opsx/`, `.claude/skills/ithy-opsx-*/` are the developer-facing skills used to develop ithyno itself (using Claude Code). Only `templates/.claude/` is affected. The scenario "repo's own .claude/ is preserved" in the spec delta guards this.

Rationale: mixing "this project uses Claude Code to develop itself" with "this project ships a CLI-agnostic scaffold for its users" would ping-pong the dev experience. Keep them separate.

## Risks / Trade-offs

- **[Non-Claude renderer content fidelity may be MVP-only]** → Mitigation: this change ships the plumbing + a working minimum (slash command discoverable, dispatch skill invokable). Any per-CLI polish (fully translating agmsg concepts, mapping Claude Task-tool subagent semantics to codex/gemini/etc equivalents) is captured as follow-ups per renderer.

- **[Existing projects break silently]** — Users who ran `openspec init` before this change have `.claude/commands/ithy-opsx/*` on disk, and their agy/codex Manager can't read it. → Mitigation: documented in the spec's migration note. Re-running init is idempotent by design.

- **[verify-bundle.mjs is spec-critical]** — If its filter set drifts from the actual `files` in `package.json`, publish-time tests break. → Mitigation: this change includes both the code changes AND the verify-bundle update in the same commit sequence; drift-guard test runs on every push.

- **[Renderer test surface explosion]** — 8 CLIs × N skills = many golden fixtures. → Mitigation: don't ship pixel-perfect golden fixtures per CLI — assert the FILE PATH exists + contains the skill name + parses as valid markdown. Deeper content assertions can come later as trust builds.

- **[Failure to name a required renderer at pick time]** — If a user picks a CLI without a renderer and init hard-fails, their init flow breaks. → Mitigation: covered by "for every Cli value, ship OR hard-fail" — no CLI can be picked without corresponding renderer OR init-time error. And picker (InitDialog) already filters to `MANAGER_VERIFIED` + `MANAGER_UNVERIFIED`, so unshipped CLIs never appear.

## Migration Plan

Deploy order:

1. Add all 8 renderers (D3).
2. Add per-CLI smoke tests (D4 step 2).
3. Wire `runInit` + `runNewProjectChain` to invoke `renderSkillsForCli(managerCli, target)` after `walkTemplates`.
4. Delete `templates/.claude/commands/{opsx,ithy-opsx}/` and `templates/.claude/skills/{opsx-*,ithy-opsx-*}/`.
5. Update `walkTemplates` filter (belt-and-suspenders).
6. Update `verify-bundle.mjs`.
7. Run `npm test` — expect all green.
8. Run `openspec validate scaffold-ithy-opsx-skills-per-cli --strict`.
9. Archive.

Rollback: revert the change's commits. `templates/.claude/…` reappears; init falls back to blind copy for all Managers (breaks non-Claude again, but restores Claude behavior).

For users with pre-fix scaffolded projects: documented workaround = re-run `openspec init` in the affected project. Optionally, add a `--reinit-skills` flag that just re-runs the renderer step (nice-to-have, out of this change's scope).

## Open Questions

None that gate this change. Renderer content fidelity per non-Claude CLI is an ongoing quality question, but the plumbing this change ships is decoupled from that.
