# Outcome: add-manager-agent-config (reverted)

**Reverted by [revert-add-manager-agent-config](../revert-add-manager-agent-config/) — 2026-07-19.**

The impl code is NOT reverted; the priority chain
(`registry.managerAgent()` → `ITHYNO_TERMINAL_STARTUP` env var →
Claude Code session-id fallback) plus `initialInput` auto-injection
all remain in effect. Only the openspec spec delta is retired —
see the revert's `proposal.md` for the full rationale:

- Both ADDED requirements are covered by successors that landed
  after this change: `Embedded PTY Uses tmux When Agmsg Is
  Configured` (3-tier priority chain + initialInput), `Manager
  Agent Server-Side Singleton Guard` (from
  `revert-refine-agents-config-modal`, contradicting the "pick
  first" clause), and `Agent Roles Array` (from
  `reshape-agents-yaml-mode-roles`, replacing `role:` with
  `roles:`).
- The `claude --continue` default was replaced by session-id logic
  from `pty-startup-uses-project-session-id`.
- `initialInput:` was folded into per-role `prompts.manager:` by
  `reshape-agents-yaml-mode-roles`.

The revert adds one companion requirement `Manager Entry Drives
Fresh PTY Startup` that makes the 3-tier chain explicit
independent of the tmux wrapping concern.

The original outcome sections are preserved below for history.

---

## ✅ Worked

- **Priority chain via one small function**. `ptyStartup(registry)`
  returns `{ startup, initialInput? }` and the fallback logic
  (manager → env var → default) fits in ~10 LOC. No new abstraction
  needed — the shape mirrors what the caller already expected.
- **Reuse of the existing loader validator**. `validateAgents` was
  the natural place to reject runtime-backed managers — one added
  guard, no new validation layer. The error message names the entry
  index so a bad config surfaces cleanly.

  *(Obsoleted — reshape removed the runtime-backed shape distinction.)*

- **Backward compat is free**. Existing users without a `role:
  manager` entry keep their current `claude --continue` behavior via
  the fallback chain. No migration prompt, no breaking change.

  *(The `claude --continue` default has since been replaced by
  session-id logic in `pty-startup-uses-project-session-id`. The
  fallback chain shape is preserved; only the terminal tier
  changed.)*

- **initialInput auto-injection is the killer feature**. Setting
  `initialInput: /opsx:manage` in agents.yaml means the Terminal
  panel opens → Claude boots → `/opsx:manage` is typed automatically.
  The Manager is running before the user does anything.

  *(Still in effect. The field name migrated to
  `prompts.manager:` via reshape, but the semantic and the code
  path survived.)*

## ⚠️ Surprises

- **Runtime-backed manager is genuinely blocked**, not just deferred.
  The runtime abstraction's promptStyle enum (`cli-arg` / `stdin` /
  `file`) has no `interactive` option — a manager that expects a TTY
  can't be expressed via a runtime declaration. Adding `interactive`
  as a fourth promptStyle is a separate design (need to decide what
  happens to `initialInput`, how to bridge PTY vs runner stdio).
  Rejecting runtime-backed managers now avoids a broken half-shape.

  *(Obsoleted by reshape — runtime abstraction was collapsed into
  `mode: single-prompt` vs `mode: live-shell`.)*

- **shellQuote() is intentionally tiny.** The regex covers the safe
  set (alnum + `._-/:@=`); anything else gets single-quoted. This
  catches the common case (args with spaces, template strings like
  `${change_id}`) without dragging in a shell-parser dep.
- **Config-writer test skipped for the manager round-trip.** Phase
  5.3's writer accepts any role string, and the loader's validation
  covers the rejection path. Duplicating a manager-specific writer
  test would just re-verify the loader guard.

## 🔁 Differently

- **Considered `terminal:` as a top-level agents.yaml key.** Cut —
  it would be a second config surface parallel to `agents:` and
  users would have to learn two shapes. Reusing the agent shape
  with `role: manager` means the Phase 5.2 Edit modal already
  supports editing the Manager without any client change.
- **Considered spawning the manager directly** (bypass the shell,
  spawn `claude` as the PTY child). Cut — losing the shell means
  losing env inheritance from `.bashrc` / `.zshrc`, and users
  expect their PATH tweaks to work. Typing the command into the
  shell keeps the ergonomic story simple.

## 🌱 Follow-ups

- **Multi-manager UI switcher.** Today the Terminal panel picks the
  first `role: manager` entry. A dropdown at the top of the panel
  ("Manager: [primary ▾]") would let users flip between declared
  managers. Cheap to add when the need materializes.

  *(Obsoleted — `refine-agents-config-modal` (later reverted)
  landed a singleton constraint. Only one manager is allowed by the
  server-side guard; a dropdown to switch between multiple would
  need to un-do that.)*

- **Runtime-backed managers.** Adding an `interactive` promptStyle
  to the runtime abstraction so runtime-backed managers can express
  themselves. Design questions: how does `initialInput` interact,
  does the runtime resolver need a PTY-aware branch, does the
  writer need to accept both shapes for managers?

  *(Obsoleted — reshape removed the runtime abstraction entirely.)*

- **Restart on reload option.** Currently reloading agents.yaml
  doesn't kill live PTY sessions — new PTYs pick up the change.
  A per-session "restart to apply" affordance in the Terminal panel
  would help when the user wants to swap managers without opening
  a fresh tab.
- **Runtime detection for the Manager.** The Runtimes section on
  the Agents tab shows worker runtime installation status. A
  similar check for the declared Manager's `command` (is `claude`
  on PATH?) would prevent silent PTY spawn failures.

  *(Partially obsoleted — Runtimes section was removed by
  `revert-runtime-abstraction`.)*
