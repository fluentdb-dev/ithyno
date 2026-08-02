# ithyno skills — universal source

This directory holds the CLI-neutral source for every skill that ithyno
ships. **Per-CLI files (`.claude/commands/*`, `.claude/skills/*`,
future `.codex/*`, `.cursor/rules/*`, etc.) are generated output**.
Do not hand-edit those — edit here and re-run install.

## Layout

```
ithyno/skills/
  <skill-id>/
    SKILL.md         ← CLI-neutral prompt body (portable markdown +
                       capability tokens; no Claude-specific syntax)
    manifest.yaml    ← metadata + per-CLI overrides. Validated against
                       schemas/skill-manifest.schema.json.
```

## Authoring a new skill

1. Create `ithyno/skills/<skill-id>/`.
2. Write `SKILL.md` using capability tokens
   (see `docs/skill-capabilities.md`) in place of CLI-specific syntax.
3. Write `manifest.yaml` — `name`, `namespace`, `command`,
   `description`, `supports` (subset of the CLI enum),
   `capabilities_required` (subset of the token vocabulary).
4. Preview the per-CLI output:
   `npm run openspec -- init --skills-only --dry-run --diff` (planned;
   see `generalize-skills-cross-cli`).
5. Commit the source. Generated files are gitignored per team default;
   contributors run install to materialize their local CLI surface.

## Why generated, not hand-authored per CLI

Every workflow change would otherwise touch 6+ CLI-specific files.
Drift is inevitable. Rendering from one source keeps semantics
identical across CLIs and lets us add new CLI adapters without
rewriting each skill 6 times.

Landed by `generalize-skills-cross-cli`.
