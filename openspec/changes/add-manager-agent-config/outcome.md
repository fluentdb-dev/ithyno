# Outcome: add-manager-agent-config

## ✅ Worked

- **Priority chain via one small function**. `ptyStartup(registry)`
  returns `{ startup, initialInput? }` and the fallback logic
  (manager → env var → default) fits in ~10 LOC. No new abstraction
  needed — the shape mirrors what the caller already expected.
- **Reuse of the existing loader validator**. `validateAgents` was
  the natural place to reject runtime-backed managers — one added
  guard, no new validation layer. The error message names the entry
  index so a bad config surfaces cleanly.
- **Backward compat is free**. Existing users without a `role:
  manager` entry keep their current `claude --continue` behavior via
  the fallback chain. No migration prompt, no breaking change.
- **initialInput auto-injection is the killer feature**. Setting
  `initialInput: /opsx:manage` in agents.yaml means the Terminal
  panel opens → Claude boots → `/opsx:manage` is typed automatically.
  The Manager is running before the user does anything.

## ⚠️ Surprises

- **Runtime-backed manager is genuinely blocked**, not just deferred.
  The runtime abstraction's promptStyle enum (`cli-arg` / `stdin` /
  `file`) has no `interactive` option — a manager that expects a TTY
  can't be expressed via a runtime declaration. Adding `interactive`
  as a fourth promptStyle is a separate design (need to decide what
  happens to `initialInput`, how to bridge PTY vs runner stdio).
  Rejecting runtime-backed managers now avoids a broken half-shape.
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
- **Runtime-backed managers.** Adding an `interactive` promptStyle
  to the runtime abstraction so runtime-backed managers can express
  themselves. Design questions: how does `initialInput` interact,
  does the runtime resolver need a PTY-aware branch, does the
  writer need to accept both shapes for managers?
- **Restart on reload option.** Currently reloading agents.yaml
  doesn't kill live PTY sessions — new PTYs pick up the change.
  A per-session "restart to apply" affordance in the Terminal panel
  would help when the user wants to swap managers without opening
  a fresh tab.
- **Runtime detection for the Manager.** The Runtimes section on
  the Agents tab shows worker runtime installation status. A
  similar check for the declared Manager's `command` (is `claude`
  on PATH?) would prevent silent PTY spawn failures.
