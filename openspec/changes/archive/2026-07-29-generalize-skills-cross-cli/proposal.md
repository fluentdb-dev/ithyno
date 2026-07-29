---
tags: [skills, cli-abstraction, init, installer, cross-cli, ux]
execution: worktree
---

## Why

Every `/opsx:*` and `/ithy-opsx:*` skill this project ships is
Claude-only. The SKILL.md files sit under `.claude/skills/`, the
command wrappers under `.claude/commands/`, and the init scaffolder
(`bin/init.js` + `templates/.claude/`) copies them verbatim. A user
running Codex, Antigravity, Copilot, Gemini, Cursor, or Opencode gets
none of the spec-driven workflow surface — `openspec new change` +
raw markdown editing is their only path.

We already prove the cross-CLI adapter pattern works in this repo:
- **agmsg** enumerates 7 CLI types (`claude-code | codex | copilot |
  gemini | antigravity | opencode | cursor`), knows each one's spawn
  binary, boot-prompt convention, and permission-skip flag.
- **doctor** already detects which CLIs are installed on the host
  (`server/doctor.ts` runs `checkCommand` for each) and reports
  `readyForManager` per CLI.

The gap: skills themselves are one-size-fits-Claude. Extending
ithyno's audience to Codex/Antigravity/etc. users blocks on this
single decision — how do skills get expressed once and installed
across CLIs.

At install time the user should pick which CLI(s) this workspace
targets, and the init flow should scaffold the skill/command surface
for each one, mirroring how agmsg's separate install lets a project
opt-in per CLI.

## What Changes

1. **New universal skill source at `ithyno/skills/<name>/`** — one
   directory per skill, containing:
   - `SKILL.md` — CLI-neutral prompt body written in portable markdown.
     Uses abstract capability tokens (`<capability:subagent_spawn>`,
     `<capability:file_watch>`, etc.) instead of hard-coded Claude
     concepts (Task tool, slash command syntax).
   - `manifest.yaml` — metadata: `name`, `namespace` (e.g. `opsx`),
     `command` (e.g. `propose`), `description`, `supports:
     [claude, codex, antigravity, cursor, gemini, copilot, opencode]`,
     `capabilities_required`, and `per_cli` overrides for CLI-specific
     wiring.

2. **Per-CLI renderers at `ithyno/skills/<name>/renderers/*.mjs`** —
   each renderer takes the universal `SKILL.md` + `manifest.yaml` and
   emits the CLI's native format at the CLI's expected path:
   - `claude.mjs` → `.claude/commands/<namespace>/<cmd>.md` +
     (if applicable) `.claude/skills/<skill-id>/SKILL.md`
   - `codex.mjs` → `.codex/...` (native format TBD from Codex docs)
   - `cursor.mjs` → `.cursor/rules/<skill-id>.mdc`
   - `antigravity.mjs` → `.antigravity/...`
   - `gemini.mjs`, `copilot.mjs` (fragment into
     `.github/copilot-instructions.md`), `opencode.mjs`

   Renderers translate abstract capability tokens into CLI-native
   invocations (Task tool subagent for Claude, subprocess for CLIs
   without in-process subagents, etc.).

3. **Install-time CLI selection** — extend `openspec init` (or add
   a sibling `ithyno install skills` command; see design.md for the
   trade-off) to prompt the user for their CLI set. Selection reuses
   `runDoctor()`'s CLI detection so uninstalled CLIs are dimmed /
   auto-excluded from the picker. For each selected CLI, applicable
   renderers run and emit the native surface files.

4. **Idempotent re-install** — running install again with a different
   CLI selection MUST update, add, and remove files cleanly. Follow
   the agmsg install pattern (which is already idempotent).

5. **Migration of existing skills** — start with `opsx-propose` and
   `opsx-apply` as pilots against `claude` + `codex` (2 CLIs), prove
   the shape, then move the remaining skills over in a follow-up
   change. Existing `.claude/skills/*` and `.claude/commands/*` files
   are demoted to renderer output.

6. **Init scaffolder update** — `templates/.claude/skills/` is
   removed; the init flow instead invokes the per-CLI renderers
   during scaffolding. The `templates/` tree keeps only truly
   CLI-neutral fixtures (e.g. `templates/CLAUDE.md`).

7. **Drift guard** — a CI test (paralleling the current
   `server/init.test.ts` template-drift guard) runs
   `ithyno install skills --dry-run --diff` and fails on any diff
   between the live per-CLI files and what the current
   `ithyno/skills/` sources would render. This catches the case where
   someone hand-edits `.claude/commands/opsx/propose.md` directly
   instead of the universal source.

## Non-goals

- **Not a plugin marketplace.** This is internal ithyno tooling for
  the skills this repo ships — not a mechanism for third parties to
  install arbitrary skills into a project.
- **Not touching the CLI enum used by agmsg.** The `AGMSG_TYPE`
  enum in `.claude/skills/ithy-opsx-dispatch/SKILL.md` stays the
  source of truth for spawn-side CLI identifiers; the skill renderer
  set will align to the same enum.
- **Not adding runtime CLI abstraction inside skills.** Skills stay
  as static prompt files rendered per CLI at install time. The
  server-side dispatcher (which is code, not prompt) already
  handles per-CLI branch logic in `ithy-opsx-dispatch`.
- **Not tackling per-CLI auth/model configuration.** Users configure
  their own CLI credentials + default model via that CLI's own
  config; ithyno just emits the skill/command surface files.

## Open questions (for design.md)

- **Manifest inline or sibling file?** Frontmatter in SKILL.md vs.
  separate `manifest.yaml`. Sibling file is easier to lint and lets
  the SKILL.md stay pure prompt text, but adds a file.
- **Renderer language?** JS modules (Node-native, easy to unit-test)
  vs. shell scripts (agmsg-consistent, no Node dep at install time
  in some environments).
- **Install entrypoint?** Fold into `openspec init` (one command
  users already know) vs. `ithyno install skills` (separate, cohesive,
  matches agmsg install's independence). Leaning toward a subcommand
  of `openspec init` for discoverability but need to weigh cohesion.
- **Generated files: commit or gitignore?** Committing makes review
  diffs painful but preserves the current "clone → cd → use" UX.
  Gitignoring forces every dev to run install first but keeps the
  repo clean and prevents drift-by-hand-edit.
- **Capability token vocabulary?** How granular?
  `<capability:subagent_spawn>` is coarse; do we also need
  `<capability:structured_output>`, `<capability:file_watch>`,
  `<capability:model_arg_passthrough>`, etc.? Start minimal, extend
  by demand.

## Impact on existing capabilities

- **New capability**: `cross-cli-skill-installer` (renderers, install
  flow, drift guard).
- **Modified capability**: `openspec-init` (adds CLI-selection prompt;
  invokes renderers instead of blind copy).
- **Modified capability**: existing skills are now generated output —
  the source of truth moves from `.claude/skills/` to
  `ithyno/skills/`. This is a MODIFIED requirement against the
  landed `.claude/skills/*` scaffolding requirements (currently
  under the dashboard capability's init/scaffold requirements).

Follow-up changes will migrate additional skills and remove
CLI-specific hardcodes from server-side dispatch prompts where the
renderer can now inject them.
