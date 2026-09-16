## Why

The Antigravity renderer currently emits skill and workflow files into `.agent/`,
the shared root that other AI tools (Codex, Zed, Cursor) also scan for their own
skills. This causes ithyno-rendered Antigravity skills to leak into unrelated
tools, and unfinished or tool-specific skills to be loaded where they should not
be. The macOS/Linux `skills.json` and `plugins.json` mechanisms let Antigravity
load from an isolated folder, so ithyno can stop polluting the shared root.

## What Changes

- Change the Antigravity renderer output root from `.agent/workflows/` and
  `.agent/rules/` to `.ithyno/antigravity/workflows/` and
  `.ithyno/antigravity/rules/`.
- Generate `.agents/skills.json` pointing Antigravity's skill discovery at
  `.ithyno/antigravity/skills/` (for OpenSpec-rendered skills).
- Generate `.agents/plugins.json` pointing Antigravity's plugin/hook discovery
  at `.ithyno/antigravity/` (for hooks.json).
- Update `agent-skills.ts` inspection paths (`CLI_LAYOUTS` / `CLI_ADAPTERS`) to
  match the new output locations.
- Update `openspec init --tools antigravity` adapter awareness so the OpenSpec
  CLI also writes its skills into the isolated path.

## Capabilities

### New Capabilities
- `antigravity-skill-isolation`: Antigravity skills and hooks are rendered into
  `.ithyno/antigravity/` with discovery JSON files bridging `.agents/` to the
  isolated root.

### Modified Capabilities
- `cross-cli-skill-installer`: The Antigravity renderer output paths change from
  `.agent/` to `.ithyno/antigravity/`, and inspection/install adapters update
  accordingly.

## Impact

- `server/skill-renderer/renderers/antigravity.ts` — output paths change.
- `server/agent-skills.ts` — `CLI_ADAPTERS` and `CLI_LAYOUTS` for `agy` update.
- `server/skill-renderer/index.ts` or `installSkills()` — must also emit
  `.agents/skills.json` and `.agents/plugins.json` when Antigravity is a
  selected CLI.
- OpenSpec's `antigravity` tool adapter (external package) may need coordination
  or a post-init fixup step.
- No changes to server API, UI, or other CLI renderers.
