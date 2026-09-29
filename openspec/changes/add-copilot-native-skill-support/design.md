## Context

The installed OpenSpec package configures GitHub Copilot with `skillsDir: ".github"`. With the default `delivery: "both"`, OpenSpec writes native skills to `.github/skills/<skill-id>/SKILL.md` and explicit command prompts to `.github/prompts/opsx-*.prompt.md`. Current Copilot CLI releases discover `.github/skills`, but ithyno's Copilot adapter still treats only prompt files as evidence of installation and its renderer produces only prompts.

The renderer currently owns deterministic generated files and overwrites changed generated targets during an update. This change must follow that existing contract rather than introduce Copilot-only conflict semantics.

## Goals / Non-Goals

**Goals:**

- Align Copilot OpenSpec inspection with the layouts emitted by the bundled OpenSpec version.
- Expose portable ithyno workflows through Copilot's native skill catalog.
- Preserve prompt files as a separate explicit command surface.
- Keep installation, update inspection, and smoke testing deterministic.
- Allow users to opt into the existing Copilot notification Hook from the same Prerequisites row as Skill management.

**Non-Goals:**

- Replacing `.github/prompts` or changing Copilot CLI invocation arguments.
- Porting additional Claude-only ithyno commands into the universal source.
- Adding Copilot-specific user-file conflict behavior that differs from other renderers.
- Changing the global OpenSpec `delivery` preference.

## Decisions

### Emit a native skill and a compatibility prompt for every portable source

The Copilot renderer will return two generated files per supported source:

1. `.github/skills/<skill-id>/SKILL.md`, with `name` and `description` frontmatter and the translated portable body.
2. `.github/prompts/<namespace>-<command>.prompt.md`, preserving the current description-only prompt frontmatter and filename.

The native skill is the discoverable reusable instruction set; the prompt remains the user-visible explicit command entrypoint. Emitting both mirrors OpenSpec's default Copilot delivery and avoids silently removing an existing surface.

### Model native skills and prompts as alternative OpenSpec layouts

`CLI_LAYOUTS.copilot` will contain a native-skills layout followed by the legacy-prompts layout. A complete layout is sufficient for `installed`, so projects created with OpenSpec's `skills`, `commands`, or default `both` delivery modes are all recognized. An incomplete layout with no other complete layout remains `partial`.

The representative adapter paths will prefer the native skill paths because they describe the current canonical skill surface.

### Make the smoke probe assert the native skill

The Copilot probe path will become `.github/skills/ithy-opsx-test-probe/SKILL.md`. The renderer tests will separately prove that the matching prompt is also emitted, so the smoke harness verifies actual skill discovery rather than only the compatibility prompt's presence.

### Reuse existing generated-file update behavior

Both outputs retain a generated-file banner and are inspected byte-for-byte through the existing renderer plan. Reinstallation refreshes stale generated output and leaves byte-identical output untouched. No unrelated paths are enumerated or removed.

### Reuse the existing notification Hook backend

The server already reports and toggles Copilot notification state and writes `.github/hooks/ithyno-notification.json`. The UI will include `copilot` in the same installed-CLI allowlist used for Claude, Codex, and Agy. Skill installation and Hook enablement remain separate actions; installing Skills never enables notifications automatically.

## Risks / Trade-offs

- **More generated files for Copilot** → Tests assert both exact output classes and inspection includes every renderer-produced file.
- **OpenSpec can be configured for commands-only delivery** → Prompt-only OpenSpec installations remain a complete supported layout.
- **Copilot discovery behavior may evolve again** → Paths are isolated in the Copilot adapter/renderer and covered by path-level regression tests.
- **Existing projects initially report ithyno updates because native skills are absent** → This is intentional; using Manage skills once adds the native skill files without removing prompts.
- **A Copilot Worker may notify even though it is not the Manager** → Notification enablement remains explicit per CLI, and users can disable it independently without changing Skill state.
