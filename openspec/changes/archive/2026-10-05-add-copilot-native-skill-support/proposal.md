## Why

Current GitHub Copilot CLI releases discover project-local skills under `.github/skills`, and the bundled OpenSpec initializer already writes native OpenSpec skills there. ithyno still detects Copilot OpenSpec support and renders its own Copilot integration only through `.github/prompts`, so a valid native installation can be reported incorrectly and ithyno workflows are not exposed through Copilot's native skill catalog.

## What Changes

- Recognize OpenSpec's native Copilot skill layout under `.github/skills` while retaining the existing prompt layout as a supported compatibility surface.
- Render every portable ithyno Copilot workflow to both a native `.github/skills/<skill-id>/SKILL.md` entry and its existing `.github/prompts/*.prompt.md` command prompt.
- Update the Copilot skill smoke test to validate the native skill artifact rather than treating the prompt file as the skill.
- Expose the already-supported Copilot notification Hook through the Settings → Prerequisites notification toggle.
- Add regression coverage for native-only, prompt-only, partial, and fully missing Copilot OpenSpec installations and for dual ithyno output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cross-cli-skill-installer`: Define the native GitHub Copilot skill and compatibility-prompt output and inspection contract.
- `agent-skill-installation-smoke-test`: Require the Copilot probe to be validated through its native project-local skill path.
- `cli-notification-hooks`: Make the existing opt-in Copilot notification Hook selectable from the Prerequisites UI.

## Impact

- Affects `server/agent-skills.ts`, the Copilot renderer, Copilot smoke-path selection, the Prerequisites notification control, and their unit/integration tests.
- Fresh and updated Copilot installations gain `.github/skills/ithy-opsx-*/SKILL.md` files while retaining `.github/prompts/ithy-opsx-*.prompt.md` files.
- No CLI flags or public API payloads change, and existing prompt-only projects remain detectable.
