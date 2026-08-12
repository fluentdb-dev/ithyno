## Why

Kanban cards display the OpenSpec change ID, but using that ID in terminal
commands currently requires selecting the heading text manually. The command
dialog already provides a compact clipboard affordance and feedback pattern
that can be reused on cards.

## What Changes

- Add a copy button to every Kanban card that writes the exact change ID to
  the clipboard without navigating to Change Detail.
- Reuse the CLI command preview's copy icon, copied-state feedback, timeout,
  and clipboard-error toast instead of maintaining a second interaction.
- Keep the copy control accessible through an explicit label and tooltip.

## Capabilities

### Modified Capabilities

- `dashboard`: Kanban cards expose a consistent change-ID clipboard action.

## Impact

- Shared clipboard UI helper.
- Command modal copy control.
- Kanban card markup and styling.
- Focused clipboard and card regression tests.
