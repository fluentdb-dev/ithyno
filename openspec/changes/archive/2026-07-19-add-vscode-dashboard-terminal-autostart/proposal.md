---
tags: [feature/terminal, area/vscode-extension]
---

# VS Code: dashboard open triggers terminal auto-launch

## Why

In Electron and browser channels, opening the dashboard immediately
starts Claude Code in the embedded xterm (via the server's `pty.ts`
fallback). In the VS Code extension the terminal is created **lazily
on the first button press** (Apply / Archive / Merge / Run) — until
the user clicks something, no `claude` process runs.

That's the point where users notice the inconsistency:

- They open the dashboard, wait for Claude to appear as it does in
  the other channels, and nothing happens.
- After clicking a Run button they finally see the terminal appear
  with `claude --session-id …` prefixed, but the flow feels
  reactive rather than "opened, ready to go."

Fixing this at panel-open time restores parity with the other
channels. A config toggle preserves the current lazy behavior for
anyone who prefers not to spawn a terminal until it's actually
needed.

## What Changes

### 1. New config: `ithyno.autoLaunchTerminal`

Added to `vscode-extension/package.json` `contributes.configuration`.
Type `boolean`, default `true`.

- `true` (default) — when `ithyno.show` opens a fresh dashboard
  panel, the extension SHALL eagerly create the "ithyno" VS Code
  Terminal and send the resolved startup command (`claude
  --session-id <uuid>` on first launch, `claude --resume <uuid>`
  thereafter, or the user's `ithyno.terminalStartup` override).
- `false` — keeps the current lazy behavior: the terminal is
  created only when a `pty.inject` message arrives from the
  webview.

### 2. Eager terminal in `ithyno.show`

The command handler currently:

1. Creates the panel
2. Registers `panel.webview.onDidReceiveMessage` — inside which the
   terminal is lazily created on `pty.inject`

The change: after step 1, if `ithyno.autoLaunchTerminal` is `true`
AND `session.terminal` is null (fresh panel, not `panel.reveal`),
extract the terminal-creation logic into a `ensureTerminal(s)`
helper and call it once eagerly. Show it with `preserveFocus:
true` so keyboard focus stays on the dashboard.

The `pty.inject` handler then simply reuses `s.terminal` (falling
back to `ensureTerminal(s)` if the user closed it manually or the
autoLaunch config is off).

### 3. `ensureTerminal(s)` helper

Encapsulates the current inline block: create VS Code Terminal
(name `"ithyno"`, cwd `s.workspaceRoot`), resolve startup via
`resolveInjectedStartup`, `sendText(startup, true)` if non-empty.
Idempotent — returns the existing terminal if still alive.

### 4. What this change does NOT touch

- **`resolveInjectedStartup` logic** — the session-id/UUID
  mint-or-resume behavior from
  `vscode-terminal-uses-project-session-id` stays unchanged. This
  change only shifts *when* the helper is called.
- **`ithyno.terminalStartup` override semantics** — non-empty value
  still wins verbatim.
- **`panel.reveal` path** — re-opening an already-open dashboard
  never creates a second terminal.
- **Electron / browser channels** — no changes; they already
  auto-launch via `pty.ts`.

## Spec deltas

- **`vscode-extension`** — **ADDED** `Dashboard Terminal Auto-launch`
  requirement covering:
  - The `ithyno.autoLaunchTerminal` config
  - The default `true` behavior (eager terminal on panel open)
  - The `false` behavior (lazy on first pty.inject)
  - The interaction with `panel.reveal` (no duplicate terminal)

## Impact

- **Affected specs**: `vscode-extension` 1 ADDED
- **Affected code**:
  - `vscode-extension/package.json`: `contributes.configuration`
    property `ithyno.autoLaunchTerminal`
  - `vscode-extension/src/extension.ts`:
    - `ensureTerminal(s)` helper
    - Eager call in `ithyno.show` when config is `true`
    - `pty.inject` handler simplified
  - `vscode-extension/README.md`: one line under "Terminal
    auto-launch" describing the new config
- **Risk**:
  - **Terminal panel opens on dashboard open** — the VS Code
    Terminal takes editor real estate at the bottom. `preserveFocus:
    true` keeps focus on the dashboard, but the terminal is
    still visible. Users who dislike this can flip the config to
    `false`.
  - **Fresh Claude session on every panel open** — the first-launch
    UUID mint runs at panel open, not on first button. Fine for
    default UX; also means the user pays claude cold-start cost
    even if they don't press anything.
- **Migration**: none — new config, default preserves parity with
  Electron/browser.

## Related

- `openspec/changes/archive/2026-07-19-vscode-terminal-uses-project-session-id/`
  (once archived) — the session-id foundation this builds on.
- `openspec/changes/archive/2026-07-19-pty-startup-uses-project-session-id/`
  — the server-side sibling.
