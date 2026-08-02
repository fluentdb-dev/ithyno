---
tags: [dashboard, settings, manager, ux, ui-simplification]
execution: worktree
---

## Why

The Settings page ships a `Default Manager` section (radio group of
installed CLIs → persists to `localStorage["ithyno.defaultManager"]`).
It duplicates the Agents tab's Manager section, and the roles were not
obvious from the UI:

- **Settings > Default Manager** — cross-project preference used by
  the Init picker for preselection when creating a NEW project.
- **Agents > Manager section** — the CURRENT project's actual manager
  entry from `agents.yaml` (edit → rewrites the file).

Two "select which CLI is Manager" radios in different places, with a
non-obvious scope difference, is UX confusion for near-zero value:
the preference-preservation is a 2-second convenience on Init, which
already knows to preselect a sensible default from the installed set.

Additionally, the two pickers now filter differently after
`fix-manager-startup-per-cli-dispatch` (2026-07-29): the Init picker
was gated to Manager-eligible CLIs (`claude`, `codex`, `agy`), but the
Settings picker still shows every installed CLI. A user can pick
`gemini` in Settings as their "default", then discover on the next
Init that `gemini` is not offered — an unavoidable contradiction as
long as the two pickers exist independently.

## What Changes

1. **Remove `DefaultManagerSection` from Settings** — the radio group
   is gone from the Settings page render, along with its section
   heading and helper text.
2. **Keep the `defaultManager` concept internally.** The store slice,
   `localStorage["ithyno.defaultManager"]` persistence, and
   InitDialog's preselect-if-eligible logic all remain. Users who
   already have a value set in localStorage keep their preference; new
   users get null and the picker preselects the first
   Manager-eligible installed CLI. The `setDefaultManager` setter
   stays exported for future implicit-write paths (e.g., "remember
   the CLI the user picked on the most recent Init").
3. **Agents > Manager section becomes the sole Manager UI.** For the
   current project's Manager, it's the single source of truth.
4. **Init picker preselect logic unchanged** — still honors
   `defaultManager` when set AND eligible, otherwise first
   eligible-installed.

## Non-goals

- **Removing the `defaultManager` store slice / localStorage.**
  Keeping the read path preserves existing users' preferences and
  leaves the door open to implicit-set flows (e.g., auto-remember
  last-Init CLI). Only the Settings-page UI is removed.
- **Wiring implicit-set from Init completion.** That's a follow-up
  design decision: does completing Init update `defaultManager`? For
  now the setter is exported but unused.
- **Changing the Agents > Manager section.** No changes to that UI
  or contract.
- **Changing the Init picker.** The candidate filter added by
  `fix-manager-startup-per-cli-dispatch` stays.

## Impact on existing capabilities

- **MODIFIED**: `Manager Entry Drives Fresh PTY Startup` — nothing
  substantive changes; the Settings picker is removed as an
  observable UI element. The requirement's own scenarios don't
  reference Settings, so no scenario changes. (Actually — this
  requirement may not need modification at all; the change is scoped
  to a spec that governs Settings UI, if one exists.)
- **REMOVED**: any spec requirement that mandates the Settings-side
  Default Manager radio (search finds no explicit requirement — the
  section was added by `expand-init-to-scaffold-agents` but not
  written into a landed spec as a distinct requirement).
- Store slice + InitDialog preselect logic remain untouched; nothing
  to modify at the spec level for those.

## Test impact

- Settings.test.ts contains a `defaultManager Settings persistence`
  describe block. Its tests target the store slice (setDefaultManager
  round-trip through localStorage), NOT the removed UI. They stay
  green because the setter still exists.
- No new tests required — the change is a UI removal, and the
  underlying state contract is unchanged.
