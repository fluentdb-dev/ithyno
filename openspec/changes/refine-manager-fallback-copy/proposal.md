---
tags: [phase-5, agents-tab, manager, copy, area/web]
---

# Soften the Manager section's "fallback" copy

## Why

`add-agents-tab-manager-section` (2026-07-12) shipped the Manager
section with the header `Manager (fallback):` for the state where
no `role: manager` entry exists but the Terminal panel is running
the hardcoded default. Immediate user feedback: **"fallback" is
jargon** — someone reading the tab for the first time doesn't
know what a fallback is, and the label doesn't tell them what to
do next.

The state IS "the user hasn't configured a Manager yet, so we're
running a default." Say that.

## What Changes

1. **`web/src/pages/Agents.tsx::ManagerSection`** — reword the
   fallback state:
   - Header: `Manager (fallback):` → `Manager (not configured
     in agents.yaml):`
   - Source line: `Source: hardcoded default` →
     `Currently running the built-in default startup command.`
   - `Source: environment variable ITHYNO_TERMINAL_STARTUP` →
     `Currently running the command from
     ITHYNO_TERMINAL_STARTUP.` (keeps precision)

2. **Spec** — MODIFY the "Fallback state shows the actual running
   command" scenario in `Agents Tab Manager Section` to use the
   new labels. Add PENDING annotation to the current spec per the
   CLAUDE.md hard rule.

## Impact

- Text-only change on the Fallback state. Declared and Idle states
  are untouched.
- No new API surface, no data model changes.
- Existing tests unaffected (there are no client-side text
  assertions on the Manager section yet).

## Out of scope

- Renaming the internal state names (`fallbackSource: "declared" |
  "env" | "default"`) — those are API values and worth keeping
  precise. The refinement is user-facing copy only.
