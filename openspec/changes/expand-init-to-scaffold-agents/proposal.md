---
tags: [dashboard, init, agents, manager, agents-yaml, prereq]
execution: worktree
---

## Why

`POST /api/init` (from `add-init-http-endpoint`) currently runs
`openspec init` on the target and returns. It creates
`openspec/` scaffolding but not `agents.yaml`. Consequence: after
Init, the project has no Manager, so:

- `guard-terminal-autolaunch-on-agents-yaml` round 2 keeps the
  terminal aside hidden (no `agents.yaml` → no PTY).
- `refactor-import-to-task-tool-subagent` returns 503 (no Manager
  PTY to inject into).
- The user is left with an incomplete setup they don't know how to
  finish.

For the two Import patterns to work (in-flight + fresh), Init needs
to scaffold `agents.yaml` too — with the user choosing which agent
CLI to use as Manager. This change makes Init a one-step
"project is ready to work" operation.

The doctor-and-installer change (dependency: `add-doctor-and-installer`)
provides the presence check. Init reuses it programmatically:

- If no agent CLI is present, Init BLOCKS with a message pointing at
  the doctor / install docs.
- If ≥1 is present, Init presents a Manager type picker limited to
  the installed CLIs, defaulting to the user's global preference
  (see Settings) or `claude` as a fallback.

## What Changes

- **Extend `POST /api/init`**:
  - Request body gains optional `manager: { command: Cli }` field.
    When omitted, server picks from the user's global preference
    (Settings key `defaultManager`) or falls back to `claude`.
  - Before scaffolding, call `runDoctor()` (from
    `add-doctor-and-installer`).
    - If `readyForManager === false` → return 409 with a clear
      message pointing at the doctor.
    - If the requested `manager.command` is `installed === false` →
      return 400 with the list of installed alternatives.
  - After `openspec init` completes, write `agents.yaml` at project
    root scaffolded from the existing template (`agents.yaml.example`).
    Substitute the chosen Manager CLI into the first `agents:` entry's
    `command:` field.
  - Response gains `{ managerCommand: <chosen CLI> }` alongside the
    existing shape.

- **Init dialog UI (Electron + browser)**:
  - New "Prerequisites" pane runs `GET /api/doctor` first. Shows
    green/red per tool. If `readyForManager === false`, shows a link
    to Settings > Prerequisites and blocks the Init button.
  - Manager type picker: dropdown limited to `agents[*].installed === true`,
    default = `defaultManager` from Settings (see Settings task below).
  - The dialog was previously the NoProjectDecisionPanel + a
    server-side init call; extract the picker so it renders both in
    the Onboarding page and NoProjectDecisionPanel.

- **Global Manager preference (Settings)**:
  - New Settings field: `defaultManager: Cli`. Persisted client-side
    (Zustand + localStorage `ithyno.defaultManager`).
  - Settings UI: a radio/dropdown showing installed agent CLIs. When
    unset, defaults to first-installed-by-priority
    (claude > codex > agy > copilot > gemini > opencode > cursor).

- **agents.yaml template**:
  - `templates/agents.yaml.example` — parameterizable version where
    `{{MANAGER_COMMAND}}` is the placeholder. Init substitutes and
    writes.
  - Keep existing `agents.yaml.example` (the human-facing example) as
    a reference doc pointing at the templated version.

## Success

- User launches ithyno on a fresh directory:
  1. Dashboard shows the 2-branch NoProjectDecisionPanel (Initialize / Browse).
  2. Init dialog appears with Prerequisites pane + Manager picker.
  3. If any agent CLI is installed, Init succeeds and creates BOTH
     `openspec/` AND `agents.yaml` at the target.
  4. Once Init returns, the dashboard's next state fetch shows
     `hasAgentsYaml: true` — the terminal aside auto-launches
     (`guard-terminal-autolaunch` allows it), Manager starts.
  5. From there the user can Import, Start, etc.
- On a target with no agent CLIs installed, Init blocks with a
  clear pointer at the doctor / install docs.
- The user's Manager preference from Settings is used as the default
  in the Init picker.
- `agents.yaml.example` remains as documentation, unchanged. The
  templated version powers Init's write.

## Non-goals

- This change does NOT install agent CLIs — that's out of scope
  (each has vendor-specific auth). Doctor + installer covers only
  tmux + agmsg.
- This change does NOT scaffold anything beyond openspec + agents.yaml
  in the target — no CLAUDE.md, no docs/, no README. Those are
  authored by the user.
- This change does NOT trigger Import automatically — that's a
  separate action after Init (`enable-import-both-patterns`).
