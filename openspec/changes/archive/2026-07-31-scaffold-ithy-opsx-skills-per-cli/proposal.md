---
tags: [skills, cli-abstraction, init, installer, cross-cli, non-claude-managers, followup]
execution: worktree
---

## Why

`generalize-skills-cross-cli` (archived 2026-07-29) landed the
universal skill source at `ithyno/skills/*` + per-CLI renderers at
`server/skill-renderer/renderers/*` and declared the spec
requirement "openspec init invokes per-CLI renderers rather than
blind template copy" in `cross-cli-skill-installer`. **The
implementation of that requirement never landed for the init path
itself** — `bin/init.js` still walks `templates/` uniformly and
copies `templates/.claude/commands/` + `templates/.claude/skills/`
verbatim, regardless of the Manager CLI the user picked in
InitDialog.

Concrete symptom (reported 2026-07-30 with test-proj2, agy
Manager): the picker offered claude / codex / agy, user picked
agy → agents.yaml correctly wrote `manager.command: agy`, BUT
`.claude/commands/ithy-opsx/*` and `.claude/skills/ithy-opsx-*/`
were scaffolded and NO `.agy/` (or antigravity-equivalent) surface
was created. agy Manager has nothing to read — `/ithy-opsx:dispatch
<change-id>` is a slash command in a namespace it doesn't
discover, so Kanban Start fires text into a Manager that treats it
as plain input. Verification of every non-Claude picker path
blocks on this.

Note: `a48ed8d` (2026-07-30) fixed the openspec-CLI side —
`openspec init --tools <picked-cli>` now scaffolds the CLI's own
AGENTS.md via openspec's own renderer. This change finishes the
job on the ithyno-native skill surface (`opsx:*`, `ithy-opsx:*`).

## What Changes

1. **Wire `bin/init.js` to invoke the per-CLI renderers** from
   `server/skill-renderer/` for the selected Manager CLI. Renderer
   picks the CLI-native surface path (`.claude/commands/…`,
   `.codex/…`, `.cursor/rules/…`, `.antigravity/…`, etc.) and
   writes the CLI-native format from the universal `ithyno/skills/`
   source.

2. **Thread the picked Manager CLI through `runInit`** so init
   knows which renderer to invoke. Extend `runInit` signature to
   accept `managerCli` (aligned with the parallel work in
   `runNewProjectChain`, which already accepts it).

3. **Retire `templates/.claude/commands/` and
   `templates/.claude/skills/`** once every skill under them has a
   working renderer path. Both trees become dead code — same fate
   the existing spec already promised for `templates/.claude/skills/`.
   `walkTemplates` skips them, `verify-bundle` drift guard is
   updated to reflect the removal.

4. **BREAKING for pre-fix scaffolded projects**: Projects init'd
   before this change have `.claude/commands/ithy-opsx/*` on disk
   even if their Manager isn't Claude. The change does NOT
   auto-migrate them — user needs to re-run init (or manually
   remove the stale `.claude/` and re-run). Documented in the
   change's outcome + a short migration note in the affected
   spec's requirement text.

5. **Extended agy / codex / cursor / gemini / copilot / opencode
   / antigravity renderer coverage** — the v1 pilot from
   generalize-skills-cross-cli may only have shipped a claude
   renderer. Any missing renderer for an already-installable CLI
   (claude, codex, agy, copilot, gemini, opencode, cursor,
   antigravity — the Cli enum in `server/doctor.ts`) is added as
   part of this change, or the CLI is documented as "not yet
   scaffolded" with a clear escalate path (init errors out with a
   pointer instead of silently mis-scaffolding).

## Capabilities

### New Capabilities

None. This change implements an existing requirement.

### Modified Capabilities

- `cross-cli-skill-installer`: the "openspec init invokes per-CLI
  renderers rather than blind template copy" requirement extends
  its scenarios to cover `templates/.claude/commands/` (not just
  `skills/`) and adds scenarios for each supported non-Claude CLI
  producing files at its declared path. Migration note for
  pre-existing projects added.
- `project-init`: "Bundled Templates" requirement narrows —
  `templates/.claude/commands/` and `templates/.claude/skills/`
  removed from the copied set. Init flow is now `walkTemplates`
  (CLI-neutral fixtures) + renderer invocation (per-CLI skill
  surface).

## Impact

- `bin/init.js`: signature change (`runInit({ managerCli, ... })`
  accepted; falls back to `"claude"` on undefined for CLI callers
  that don't specify). `walkTemplates` filter updated to skip the
  soon-to-be-removed template subtrees. Renderer invocation added
  post-template-copy.
- `templates/.claude/commands/` + `templates/.claude/skills/`:
  **deleted** (or emptied to a placeholder README) once renderer
  coverage complete.
- `server/skill-renderer/`: any missing per-CLI renderer files
  added. Renderer contract already exists.
- `scripts/verify-bundle.mjs`: drift guard updated — no longer
  expects `templates/.claude/commands/ithy-opsx/…`,
  `templates/.claude/skills/ithy-opsx-*/…` under the packaged
  files list.
- `.claude/` (this repo's dev copy of the skills): stays.
  Developing ithyno itself uses Claude Code, so the dev copy is
  legitimately Claude-shaped. Only the `templates/` copies are
  affected.
- `server/init-handler.ts`: `resolveManagerFromDoctor` already
  produces the `chosenCli`; the writeAgentsYaml path stays
  unchanged. init-handler forwards `chosenCli` into `runInit` /
  `runNewProjectChain`.
- Existing tests: `server/init.test.ts` +
  `server/new-project-chain.test.ts` extended to assert per-CLI
  scaffold paths land at the right location for at least
  `claude` + one non-Claude CLI (agy or codex).
- **Not addressed** (deferred): Manager startup strategy for
  non-Claude CLIs. `MANAGER_STARTUP_STRATEGIES` still only
  registers `claude`. This change makes the skill files discoverable
  by the CLI; a separate change adds session-resume semantics per
  CLI so restarting the Manager PTY doesn't lose conversation
  state.
