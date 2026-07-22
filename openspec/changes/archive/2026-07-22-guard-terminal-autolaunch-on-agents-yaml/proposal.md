---
tags: [terminal, agents, dashboard, embedded-terminal, onboarding]
execution: worktree
---

## Why

The embedded terminal auto-launches on every dashboard open (its
default behavior, plus VS Code's `ithyno.autoLaunchTerminal: true`
config). The auto-launch spawns a Claude Code process into a fresh
PTY. In projects that have `agents.yaml`, that's the intended
Manager session that later drives dispatch. But in projects with
**no `agents.yaml`**:

- There's no agent config → no worker will ever be dispatched to
  this session
- The auto-spawned Claude Code is a plain interactive session — no
  worse than the user opening it manually, but also no better
- On import of an existing repo (per `unify-open-project-3-branch`),
  the user hasn't configured agents yet; auto-launching a Claude
  session that immediately consumes context budget is surprising
  and wasteful

Guarding the auto-launch on `agents.yaml` presence gives a cleaner
onboarding: no agents configured → no session spawned. Users who
want a plain terminal can still open one via the size toggle's
Default option (mounts the PTY), or via any other manual
affordance.

## What Changes

- **`server/pty` (or wherever the auto-launch decision is made)**:
  when the auto-launch prompt would fire, check for
  `<project-root>/agents.yaml`. If absent, DO NOT auto-inject the
  boot command. The PTY still spawns as a shell, but no Claude
  Code process is auto-invoked.
- **`vscode-extension/src/extension.ts`**: the same guard applies
  to the extension's auto-open path. If the project has no
  `agents.yaml`, the extension does NOT auto-launch its terminal
  even when `ithyno.autoLaunchTerminal === true`. The user setting
  becomes "auto-launch IF configured for agents".
- **Setting rename (optional, but recommended)**: change the
  semantic of `ithyno.autoLaunchTerminal` from "always" to
  "auto-launch when agents.yaml is present". Update the setting's
  description text. No new key; the boolean still means "opt in to
  auto-launch", but the auto-launch itself becomes conditional.
- **Dashboard hint**: in the No-Project / Empty-agents-yaml state,
  render a small hint: "Auto-launch is off — this project has no
  `agents.yaml`. Add one to enable agent dispatch, or open the
  terminal manually via the size toggle."
- **No change to manual terminal open**: users can always open the
  terminal via the size toggle (from `add-terminal-size-toggle`)
  → default state. That triggers the standard PTY spawn with the
  configured startup command (`ithyno.terminalStartup` or the
  per-project session-id logic).

## Success

- Opening a project that has no `agents.yaml`:
  - Dashboard loads without auto-spawning a Claude Code process
  - Embedded terminal panel is NOT auto-visible (default size
    remains `default` = terminal panel visible, but the PTY inside
    is a plain shell, not an auto-Claude)
  - No `tmux` / `claude --resume` invocations trigger from open
- Opening a project that has `agents.yaml`:
  - Behavior unchanged from today — Claude Code auto-launches per
    the configured startup command
- VS Code extension: same guard applies.
  - Setting `ithyno.autoLaunchTerminal` semantically becomes "opt
    in when agents.yaml exists"; user documentation clarifies this
- Manual terminal open (via the size toggle or any explicit user
  action) still fires the standard PTY spawn. Users are never
  blocked from starting a session — the auto-behavior is just
  quieter until agents are configured.
