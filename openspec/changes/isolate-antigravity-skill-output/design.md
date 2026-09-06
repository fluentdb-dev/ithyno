## Approach

Move Antigravity renderer output to `.ithyno/antigravity/` and bridge discovery
via `.agents/skills.json` and `.agents/plugins.json`.

## Key Decisions

### Output root: `.ithyno/antigravity/`

All Antigravity-specific files move from `.agent/` to `.ithyno/antigravity/`:

| Before | After |
|--------|-------|
| `.agent/workflows/ithy-opsx-*.md` | `.ithyno/antigravity/workflows/ithy-opsx-*.md` |
| `.agent/rules/ithy-opsx-dispatch.md` | `.ithyno/antigravity/rules/ithy-opsx-dispatch.md` |

OpenSpec-rendered skills (from `openspec init --tools antigravity`) also move:

| Before | After |
|--------|-------|
| `.agent/skills/openspec-*/SKILL.md` | `.ithyno/antigravity/skills/openspec-*/SKILL.md` |
| `.agent/workflows/opsx-*.md` | `.ithyno/antigravity/workflows/opsx-*.md` |

### Discovery bridge files

Two JSON files in `.agents/` tell Antigravity where to find the isolated content:

**`.agents/skills.json`** — redirects skill discovery:
```json
{
  "entries": [
    { "path": ".ithyno/antigravity/skills" }
  ]
}
```

**`.agents/plugins.json`** — redirects hook/plugin discovery:
```json
{
  "entries": [
    { "path": ".ithyno/antigravity" }
  ]
}
```

**`.ithyno/antigravity/plugin.json`** — plugin identity:
```json
{ "name": "ithyno" }
```

### Renderer change

In `antigravity.ts`, change the output path prefix from `.agent/` to
`.ithyno/antigravity/`:

```typescript
// workflows
const path = `.ithyno/antigravity/workflows/${ns}-${cmd}.md`;

// dispatch rule
{ path: ".ithyno/antigravity/rules/ithy-opsx-dispatch.md", ... }
```

### Discovery file emission

`installSkills()` in `skill-renderer/index.ts` gains a post-render step: when
`antigravity` is among the selected CLIs, emit the three bridge files
(`.agents/skills.json`, `.agents/plugins.json`, `.ithyno/antigravity/plugin.json`).
Merge into existing JSON if the files already exist (preserve user entries).

### Inspection update

`agent-skills.ts` updates:

- `CLI_ADAPTERS["agy"].openspecPaths` →
  `[".ithyno/antigravity/workflows/opsx-propose.md", ".ithyno/antigravity/workflows/opsx-apply.md"]`
- `CLI_LAYOUTS["agy"]` layouts update required paths to `.ithyno/antigravity/`
  prefixed equivalents.

### OpenSpec init coordination

`openspec init --tools antigravity` is an external package. Two options:
1. **Post-init fixup** (preferred): after `openspec init` writes to `.agent/`,
   `installAgentSkills()` moves/copies the files to `.ithyno/antigravity/`.
2. **Upstream PR**: update the OpenSpec antigravity adapter to accept a
   `--output-root` flag.

Option 1 is self-contained and ships immediately.

## Components

1. `server/skill-renderer/renderers/antigravity.ts` — path prefix change
2. `server/skill-renderer/index.ts` — bridge file emission after Antigravity render
3. `server/agent-skills.ts` — `CLI_ADAPTERS`, `CLI_LAYOUTS` path updates + post-init fixup
4. Tests — update expected paths in antigravity renderer tests and agent-skills tests

## Risks

- **Existing projects**: Projects with skills already in `.agent/` will show as
  "missing" after upgrade until re-installed. Acceptable since Manage Skills
  re-runs the full install.
- **OpenSpec init writes to old path**: Mitigated by the post-init fixup step
  that relocates files after `openspec init` completes.
