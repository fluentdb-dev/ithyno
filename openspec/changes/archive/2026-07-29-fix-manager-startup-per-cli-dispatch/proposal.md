---
tags: [dashboard, init, pty, manager, cli, session-persistence, retrofit]
execution: worktree
---

## Why

> **Retrofit** — implementation landed on
> `feature/add-phase-lane-view-toggle` as commit `4d1687b` before this
> proposal was written. The commit was initially framed as a bug fix
> (init writes wrong args) and skipped propose per CLAUDE.md's "bug
> fixes skip proposal" clause. On review that framing was wrong: the
> change adds new capabilities, alters observable UI, and shifts a
> file-system contract. This retrofit records what shipped.

Three coupled Manager-CLI bugs surfaced during the develop-merge
verification and were fixed together in one commit because they share
the same root cause: **Init writes CLI-specific args that don't work
at runtime**.

1. **`templates/agents.yaml.tmpl` hardcoded `args: [--continue]`** —
   broken from day one:
   - `--continue` on Claude fails on first launch (no conversation to
     resume).
   - `--continue` doesn't exist for Codex, Copilot, Gemini, or any
     non-Claude CLI — selecting them as Manager produced an
     immediately-dying PTY.
2. **`resolveSessionIdStartup()` was misnamed as generic but
   hardcoded Claude** — returned literal `"claude"`, `claude
   --session-id`, `claude --resume`. Any smart resume story for other
   CLIs had to route through this Claude-only path or bypass it
   entirely.
3. **Init Manager picker offered every installed CLI** — including
   ones that could not actually run as Manager because the ithyno
   `/ithy-opsx:dispatch` skill only lives under `.claude/commands/`
   (`generalize-skills-cross-cli` v1 pilot has renderer infrastructure
   but hasn't ported the dispatch skill to other CLIs yet).

The three interact: the picker lets you pick codex, init writes
`command: codex, args: [--continue]`, PTY spawn dies. Even if the
picker were smarter (Claude-only), the args issue would still bite
Claude first launch. And `resolveSessionIdStartup` being generic-named
but Claude-only prevents the natural fix ("dispatch by CLI") from
being obvious in the code.

## What Changes

1. **Template default (agents.yaml.tmpl)** — Remove
   `args: [--continue]`; write `args: []` with a comment naming the
   per-CLI runtime dispatch as the authority. Contract change: init
   no longer bakes in a startup flag.

2. **Per-CLI Manager startup dispatch (server/sync/pty.ts)** — Add a
   `MANAGER_STARTUP_STRATEGIES: Record<Cli, ManagerStartupStrategy>`
   table + `resolveManagerStartup(command, projectRoot)` function.
   Claude gets the mint/resume strategy (moved out of
   `resolveSessionIdStartup`); other CLIs get plain `<cli>` as a
   safe first-launch default. `ptyStartup()`'s empty-args branch
   defers to `resolveManagerStartup`; explicit args in agents.yaml
   still bypass (backward compat contract preserved). New capability:
   per-CLI startup dispatch.

3. **Session-id file per-CLI split** —
   `.ithyno/session-id` → `.ithyno/session-claude`. The Claude
   strategy still reads the legacy path as a fallback so existing dev
   environments don't lose their conversation on first PTY spawn after
   this change lands. Fresh mint writes only to the new location.
   File-system contract change with backwards-compatible read path.

4. **Rename `resolveSessionIdStartup` → `resolveClaudeSessionStartup`**
   — internal, but the misnomer was actively confusing. New name
   states the semantics.

5. **Manager picker gating (InitDialog.tsx)** — Split into two
   constants: `MANAGER_VERIFIED = ["claude"]` and
   `MANAGER_UNVERIFIED = ["codex", "agy"]`. Picker offers only their
   union intersected with the installed set. `copilot`, `gemini`,
   `opencode`, `cursor`, `antigravity` are hidden from the picker (all
   remain valid as agmsg-spawned WORKERS — this only affects the
   Manager role selection). `codex` and `agy` render with a
   `(動作未確認)` label; the label is dropped once each CLI has (a) a
   startup strategy in `MANAGER_STARTUP_STRATEGIES` and (b) its
   dispatch skill resolves in that CLI's command surface (deferred to
   the `generalize-skills-cross-cli` renderer follow-ups). Observable
   UI change.

6. **Preselect logic** respects the candidate filter — the
   `defaultManager` from the store is honored only if it's still
   Manager-eligible; otherwise falls back to the first eligible +
   installed CLI.

7. **Tests** — 16 new tests (7 per-CLI dispatch in `pty.test.ts`, 7
   candidate-filter combos in `InitDialog.test.ts`) + 3 renamed
   existing session-id → session-claude tests. Explicit verification:
   `ptyStartup` with `command: codex, args: []` returns plain
   `"codex"` (no `--continue` leak); `ptyStartup` with `command:
   claude, args: []` returns `claude --session-id <uuid>` on first
   launch.

## Non-goals

- **Per-CLI session persistence for Codex / Agy / Copilot / Gemini /
  Opencode / Cursor.** The dispatch table has slots for them but no
  entries. Each CLI's resume mechanism (`codex resume`, etc.)
  requires per-CLI research and is spun out to individual follow-up
  changes.
- **Dispatch skill port to other CLIs.** That's the
  `generalize-skills-cross-cli` renderer arm. Until it lands, even
  `codex` selected as Manager can't run the ithyno workflow — the UI
  correctly warns via `(動作未確認)`.
- **Removing the picker filter** for copilot/gemini/opencode/cursor/
  antigravity. That happens once each CLI has both a startup strategy
  and a dispatch skill in its command surface.
- **Data migration** — the legacy `.ithyno/session-id` file is not
  automatically renamed. The Claude strategy reads it as fallback but
  never rewrites it (fresh mints go to the new `session-claude`
  path). Dev environments naturally converge over time.

## Impact on existing capabilities

- **MODIFIED**: `Manager Entry Drives Fresh PTY Startup`
  (`openspec/specs/dashboard/spec.md`) — priority 1's "command +
  args" now has a new sub-rule: empty `args` defers to per-CLI
  dispatch. Priority 3's `.ithyno/session-id` becomes
  `.ithyno/session-claude` (with legacy read fallback).
- **ADDED**: `Manager PTY startup dispatches per CLI when args are
  empty` (new capability — the dispatch table).
- **ADDED**: `Manager picker filters to Manager-eligible CLIs with
  unverified label` (new UI contract).
