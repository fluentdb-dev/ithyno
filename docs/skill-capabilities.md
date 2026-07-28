# Skill capability tokens (v1)

Skills written under `ithyno/skills/<name>/SKILL.md` express
CLI-dependent primitives as **capability tokens** rather than
CLI-native syntax. Renderers translate each token into the target
CLI's invocation at install time.

Landed by `generalize-skills-cross-cli`.

## v1 vocabulary

The v1 vocabulary is deliberately minimal — three tokens covering
the primitives every current ithyno skill needs. Extend by demand;
overspecifying up-front is worse than iterating.

### `<capability:subagent_spawn>`

> Launch a sub-worker with a boot prompt and wait for its completion.

- **Claude renderer** → Task tool invocation with the boot prompt
  as the subagent's initial message.
- **Codex renderer** (future) → `codex run <boot-prompt-file>` or
  equivalent subprocess.
- **Cursor renderer** (future) → subprocess call to `cursor-agent`
  if available; else soft-fail with warning.
- **Copilot renderer** (future) → Copilot does not currently expose
  in-process subagents; renderer soft-fails with capability warning
  and the skill is skipped for Copilot users.

Skills using this token MUST list `subagent_spawn` in
`capabilities_required`.

### `<capability:file_write>`

> Modify a project file at a given path.

- Every CLI supports file writes (or the user wouldn't be running
  it as an agent). Renderers translate to whichever tool the CLI
  uses (Edit / Write / str_replace_editor / ...) via a canonical
  reference in the rendered body.

Named as a capability so the renderer can insert the CLI's
tool-name convention. Not intended to be strictly gated.

### `<capability:bash>`

> Shell out to run a command.

- Same story as `file_write` — universally supported but named so
  renderers can inject the CLI's shell-invocation convention.

## Adding a new token

1. Update this doc with the token name, one-line semantics, and how
   each renderer should translate it.
2. Update `schemas/skill-manifest.schema.json`'s
   `capabilities_required.items.enum`.
3. Update `scripts/lint-skill-tokens.mjs`'s known-token set.
4. Update each renderer to handle the new token (or fall back to
   soft-fail with a clear message).

## Linter

`scripts/lint-skill-tokens.mjs` scans every
`ithyno/skills/**/SKILL.md` for `<capability:*>` tokens and rejects
any that are not in the v1 vocabulary. Run as part of `npm test`.

## Rationale

Skill bodies are 95% workflow prose. The remaining 5% is
"invoke a sub-worker" / "modify this file" / "run this command".
Naming those three lets renderers substitute CLI-native syntax
while the prose stays universal.
