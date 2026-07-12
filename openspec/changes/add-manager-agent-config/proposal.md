---
tags: [phase-5, manager, agents-yaml, terminal, area/server, area/web]
---

# Declare Manager in `agents.yaml` via `role: manager`

## Why

Today the embedded Terminal panel launches `claude --continue`
hardcoded (via `server/sync/pty.ts::ptyStartupCommand`, overridable
only via the `ITHYNO_TERMINAL_STARTUP` env var). That interactive
Claude session becomes the Manager when the user types `/opsx:apply`
or `/opsx:manage` — so the choice of Manager runtime is baked into
the code, not surfaced to the user.

But the Manager IS the user's most important lever: it's the
runtime that orchestrates the whole change lifecycle. Different
users want different Managers (Claude Code, Aider, Codex, custom).
`agents.yaml` already declares workers (role=code / review /
verify) — the natural place to also declare the Manager.

This change adds `role: manager` handling to `agents.yaml` and
routes the Terminal panel's PTY startup through it. Phase 5.2's
Edit modal already exposes `manager` in the role dropdown; this
change wires the semantics.

## What Changes

### Config

1. **`role: manager`** becomes a first-class shape in
   `agents.yaml`. Same schema as a worker entry — command / args
   OR runtime / prompt, plus role="manager", plus an optional
   `initialInput` that the Terminal panel injects after launch
   (e.g., `/opsx:manage` to auto-start the Manager loop; blank to
   leave the REPL idle).

2. **Multiple manager entries allowed**. The Terminal panel picks
   the first one; a follow-up change can add a UI switcher when
   the need is real.

3. **Backward compatibility**: if `agents.yaml` has no
   manager-role entry, the panel falls back to
   `ITHYNO_TERMINAL_STARTUP` env var, then to the hardcoded
   `claude --continue`. The env var wins over the fallback but
   the manager entry wins over both. This lets existing setups
   keep working without a config change.

### Server

4. **`server/agents/registry.ts`** — `managerAgent()` getter that
   returns the first `role: manager` entry (or `null`).

5. **`server/sync/pty.ts`** — `ptyStartupCommand()` now takes the
   registry as an argument, consults `managerAgent()`, and only
   falls back to env / default when no manager is declared. The
   returned shape includes `initialInput` so the caller can
   auto-inject after spawn.

6. **`server/index.ts`** — thread the registry through to the PTY
   WebSocket handler so it can access `managerAgent()` at connect
   time.

### Client

7. **`web/src/pages/Agents.tsx`** — the Configured (idle) section
   already renders all agents; a `role: manager` entry naturally
   appears there. The role badge shows "MANAGER" and the row's
   Edit modal works as before.

8. **`web/src/components/AgentConfigModal.tsx`** — the modal
   already has `manager` in the role dropdown (Phase 5.2). No
   change needed.

### Documentation

9. **`agents.yaml.example`** — add a commented-out manager entry
   so users see the shape.

10. **`docs/` update** — mention the manager declaration in the
    architecture doc (`docs/2026-07-06-phase-2-implementation-and-redesign.md`
    or a fresh follow-up).

## Impact

- **Existing users**: the fallback chain (manager entry → env
  var → default) means the current `claude --continue` still
  works without config changes.
- **New capability**: users declare their preferred Manager in
  `agents.yaml`; the Edit modal edits it like any other agent.
- **Files added / changed**: `server/agents/registry.ts`,
  `server/sync/pty.ts`, `server/index.ts`, `agents.yaml.example`.
- **Tests**: registry tests for `managerAgent()` selection;
  pty.ts test for the fallback chain.

## Out of scope

- **Runtime-backed manager shape**. Managers are interactive
  PTYs, not `-p` mode calls. Wiring `runtime: <name>` for a
  manager requires an `interactive` promptStyle that doesn't
  exist yet. This change accepts legacy-shape managers only
  (command + args). Follow-up if runtime-backed managers become
  a real want.
- **Multi-manager UI switcher**. Just picks the first one for
  now. A dropdown at the top of the Terminal panel is a
  follow-up.
- **Auto-launching the Manager on Kanban Start**. Today the user
  types `/opsx:apply <id>` themselves in the terminal. That flow
  stays; this change only lets the user choose WHAT runs in the
  terminal.
