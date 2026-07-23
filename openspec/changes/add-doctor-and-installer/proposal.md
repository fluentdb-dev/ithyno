---
tags: [dashboard, cli, doctor, installer, agents, prereq]
execution: worktree
---

## Why

Ithyno assumes several external CLIs are on `PATH`:

- **Claude Code**, Codex, `agy` (antigravity client), Copilot,
  Gemini, OpenCode, or Cursor — for the Manager role and its worker
  sub-agents. At least ONE agent CLI must be present.
- **tmux** — for wrap-embedded-pty-in-tmux (multi-pane spawn).
- **agmsg** — optional, only needed for live-shell dispatch. Absence
  is fine when Task-tool dispatch is used.

Today, if any of these are missing, ithyno fails opaquely: the
terminal aside spawns and immediately dies, or a slash command
silently no-ops, or a worker CLI prints "command not found". Users
can't diagnose without reading the log.

For the new-project Init flow (`expand-init-to-scaffold-agents-yaml`)
and Import flow (`enable-import-both-patterns`) to be useful, we
need a **doctor check** that runs BEFORE Manager spawn is attempted:

- Enumerate what's installed vs. missing (agent CLIs, tmux, agmsg).
- Report presence + version.
- Offer a one-click install for the optional pieces (tmux via
  `brew` on macOS / `apt` on Linux; agmsg via the existing
  `ensureAgmsgInstalled` path).
- For agent CLIs — do NOT auto-install (each has different auth
  flow), but link to their install docs.

Init flow (change 2) will call the doctor programmatically:

- If NO agent CLI is present → block Init, tell user to install one.
- If tmux / agmsg missing → warn but allow (they can install later).
- If ≥1 agent CLI present → let user pick which to use as Manager.

## What Changes

- **New `server/doctor.ts`** — pure check module.
  - `checkAgentCli(cli): { installed: boolean; version?: string; path?: string }` —
    runs `<cli> --version` in a bounded subprocess, parses.
  - `checkTmux()` / `checkAgmsg()` — same shape.
  - `runDoctor(): DoctorReport` — full snapshot returning per-CLI
    status + a `readyForManager: boolean` field (`true` when ≥1
    agent CLI is installed).

- **New endpoint `GET /api/doctor`** — returns `DoctorReport`.
  Requires session token like other endpoints.

- **New CLI subcommand `ithyno doctor`** — runs the same
  `runDoctor()` and prints a human-readable report to stdout. Exit
  code 0 when `readyForManager === true`, 1 otherwise.

- **New endpoint `POST /api/doctor/install`** — takes
  `{ tool: "tmux" | "agmsg" }`, invokes the appropriate installer
  path, streams progress via SSE (short-lived — install completes
  in seconds/minutes). Returns 400 for anything else (no agent-CLI
  auto-install). tmux install uses the standard package manager
  detection (macOS: brew; Linux: apt-get / dnf / pacman; else return
  a message pointing at the docs).

- **Settings UI section**: `web/src/pages/Settings.tsx` gets a new
  "Prerequisites" card showing the same DoctorReport data, plus
  install buttons for tmux + agmsg when missing. Refreshes on WS
  event when installers complete.

- **Programmatic hook for Init**: export `runDoctor()` from
  `server/doctor.ts` so `expand-init-to-scaffold-agents-yaml` can
  reuse it during the Init flow.

## Success

- `ithyno doctor` prints a report like:
  ```
  claude:  installed  v1.2.3   /opt/homebrew/bin/claude
  codex:   missing
  agy:     installed  v0.4.1   /usr/local/bin/agy
  tmux:    installed  v3.5a    /opt/homebrew/bin/tmux
  agmsg:   installed  v0.7.0   /Users/.../.agents/skills/agmsg
  ready for Manager: yes
  ```
- Settings page shows the same, plus [Install] buttons for tmux /
  agmsg when missing.
- `GET /api/doctor` returns the same data as JSON.
- `POST /api/doctor/install {tool: "tmux"}` on macOS shells out to
  `brew install tmux` and streams output. Rejects invalid tool
  strings with 400.
- The Init flow (change 2) can call `runDoctor()` synchronously
  and read `readyForManager` before continuing.
- Agent CLIs are NOT auto-installed — user gets a link to the
  vendor's docs.

## Non-goals

- This change does NOT modify Manager spawn or agents.yaml
  scaffolding — that's change #2 (`expand-init-to-scaffold-agents-yaml`).
- This change does NOT auto-install agent CLIs (Claude Code, Codex,
  etc.). Their auth is vendor-specific.
- This change does NOT gate Kanban Start on doctor status (a stale
  Manager would still fail per existing mechanisms). The doctor is
  advisory + Init-gating, not a hard runtime gate elsewhere.
