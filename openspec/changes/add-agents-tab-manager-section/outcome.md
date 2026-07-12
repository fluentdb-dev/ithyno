# Outcome: add-agents-tab-manager-section

## ✅ Worked

- **The tab is honest about what's running.** The user's original
  question — "if the fallback claude --continue is running, why
  isn't it visible?" — was a spec gap. The Manager section always
  shows one of three states (Declared / Fallback / Idle) so nothing
  running is invisible.
- **One endpoint, one state slice.** `GET /api/manager/status`
  returns exactly the shape the UI needs; the client mirrors it as
  `ManagerStatus` and threads through `loadManagerStatus()`. No
  polling, no derived state juggling — the tab fetches once on
  mount just like agents / jobs / runtimes.
- **`addModePrefill` closes the Declare loop** cleanly. The
  Fallback card's `[Declare in agents.yaml]` button opens the
  existing modal in Add mode with `command`, `args`, and
  `initialInput` prefilled from the resolved startup — user just
  types a name and hits Save. The current fallback becomes the
  first-class declared Manager.
- **The Modal accepts the prefill without a signature rewrite.**
  Adding an optional `addModePrefill` prop kept every existing
  caller working and the change is easy to reason about at read
  time (either `seed === "new"` → empty defaults, or
  `seed === "new"` with prefill → derived-form-but-name-empty).

## ⚠️ Surprises

- **`activeTerminalCount()` is already exposed** but was only used
  by `/api/health`. Re-using it here means the Manager section
  updates in real time relative to whether the Terminal panel is
  actually open — no separate PTY inventory needed.
- **Naive whitespace split for command / args works fine.** The
  fallback `claude --continue` is trivial to parse; the concern
  about quoted args was unnecessary because the loader validator
  wraps args in an array anyway. If someone ever sets
  `ITHYNO_TERMINAL_STARTUP="mycmd '--flag with spaces'"`, the
  Declare prefill would over-split, but the user can fix it in the
  modal before saving.
- **The 4-section header comment is now stale.** The tab actually
  has 5 sections now (Runtimes / Manager / Live / Configured /
  Recent). Minor tidy left as a follow-up.

## 🔁 Differently

- **Considered a WebSocket push for terminalActive changes** so the
  Manager section reflects "Terminal just opened" without a manual
  refresh. Cut — the tab is fetch-on-mount for every other section
  already, and the Fallback → Declared transition happens right
  after the user hits Save, which triggers `loadAgents` +
  refetching manager status naturally.
- **Considered making the Manager section always visible even in
  Idle state.** Kept — Idle shows an explicit "No manager
  declared" message rather than hiding the section entirely. The
  section is a permanent slot in the tab; if it were sometimes
  absent, the user's mental model would slip again ("wait, where's
  Manager?").

## 🌱 Follow-ups

- **Refresh Manager status on Terminal panel open/close.** The tab
  currently only re-fetches on mount. If the user opens a change
  view (which spawns a PTY) while the Agents tab is already open,
  they'd see stale "Idle" until manually navigating away and back.
  A store subscription on the terminal-active event would fix this.
- **Multi-manager display when the spec eventually permits.**
  Currently Manager is a singleton (refine-agents-config-modal), so
  the section shows exactly one row. If we ever add
  runtime-backed managers or per-worktree overrides, the section
  will need a list layout.
- **Runtime detection for the Manager command.** The Runtimes
  section shows worker-runtime install status; a similar check for
  the Manager's `command` (is `claude` on PATH?) would prevent
  silent PTY spawn failures.
- **The stale 4-section header comment** in `Agents.tsx` — small
  cleanup for the next Agents-tab-touching change.
