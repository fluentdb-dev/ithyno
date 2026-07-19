---
tags: [feature/init, area/vscode]
---

# VS Code extension terminal mirrors the per-project session-id flow

## Why

`pty-startup-uses-project-session-id` (2026-07-19 archived) landed a
per-project Claude Code session id under `.ithyno/session-id`, so
the **embedded** Terminal panel (Electron / browser dashboard) uses
`--session-id` on first launch and `--resume` thereafter.

The **VS Code extension** has a separate terminal path — it doesn't
consume `server/sync/pty.ts`. Instead it calls
`vscode.window.createTerminal({ cwd: workspaceRoot })` and sends the
value of the `ithyno.terminalStartup` config setting via
`terminal.sendText(...)`. That setting's default is still
`"claude --continue"`, so VS Code users hit the same "No conversation
found to continue" stall the server side just fixed.

Fixing this brings VS Code to the same contract:

- Default (config unset or empty): the extension mirrors the
  server-side session-id logic against the workspace's
  `.ithyno/session-id` file.
- Explicit override (`ithyno.terminalStartup: "..."` set): the
  extension uses that verbatim (respect the user's choice).

## What Changes

### 1. `ithyno.terminalStartup` default flips to `""`

`vscode-extension/package.json`:

```jsonc
"ithyno.terminalStartup": {
  "type": "string",
  "default": "",
  "description": "Command auto-launched in the injected ithyno terminal. Empty string (the default) means ithyno chooses per-project: `claude --session-id <uuid>` on first launch, `claude --resume <uuid>` thereafter, via `.ithyno/session-id`. Set explicitly to override (e.g. `claude` for fresh-every-time, `claude --continue` for the old behavior, or your own tool)."
}
```

The empty-string default is the same shape existing config already
recognizes for "raw shell" — this change re-interprets empty as
"session-id logic" and adds explicit strings for opt-outs.

### 2. Session-id logic in the extension

`vscode-extension/src/extension.ts` — when the terminal is created
and the config value is empty (or missing), the extension SHALL:

1. Read `<workspaceRoot>/.ithyno/session-id`. Trim whitespace.
2. **File missing OR empty** → mint a UUID v4
   (`crypto.randomUUID()`), ensure `<workspaceRoot>/.ithyno/`
   exists, write `<uuid>\n` to the file, and send
   `claude --session-id <uuid>` to the terminal.
3. **File present, non-empty** → send `claude --resume <uuid>`.

Failures (write EACCES, filesystem errors) fall back to sending
`claude` (fresh session) and log a warning via `console.warn` — no
UI popup for what should be transparent behavior.

When the config value is non-empty, the extension sends it
verbatim — same as today.

### 3. Docs breadcrumb (README)

`vscode-extension/README.md` — one paragraph noting the new
session-id behavior and how to override via
`ithyno.terminalStartup`.

### 4. What this change does NOT touch

- **`server/sync/pty.ts`** — unchanged; the server-side path
  already has session-id logic.
- **The webview panel URL / server spawn** — unchanged.
- **The extension's `ithyno.show` command** — unchanged.
- **`.gitignore` maintenance in VS Code path** — VS Code extension
  does not run `runInit`. If the workspace was scaffolded via
  `npx ithyno init` or the browser flow, `.ithyno/` is already
  gitignored. If it wasn't, the user sees `.ithyno/session-id`
  as untracked but the extension doesn't touch `.gitignore`.

## Spec deltas (`vscode-extension` capability)

- **ADDED** `Injected Terminal Startup Command` — describes the
  contract for how the extension picks the auto-launched command
  when the VS Code terminal is (re)created.

## Impact

- **Affected specs**: `vscode-extension` — 1 ADDED
- **Affected code**:
  - `vscode-extension/package.json`: config default + description
  - `vscode-extension/src/extension.ts`: resolveVsCodeStartup
    helper + call site update
  - `vscode-extension/README.md`: one paragraph
- **Risk**:
  - **Existing users with unset `ithyno.terminalStartup`** — behavior
    changes from `claude --continue` to session-id-managed. Better
    UX for new projects (no stall), matches server-side behavior.
    Users who preferred continue behavior set the config
    explicitly.
  - **Users on the extension without a scaffolded project** — the
    workspace may lack `.ithyno/` (never ran `ithyno init`, never
    ran browser/Electron New Project). The extension creates the
    directory + file itself; the workspace's `.gitignore` may not
    exclude it, so `.ithyno/session-id` shows up as untracked. Not
    a bug — the file is honest state — but easy to overlook.
    Documented in README.
  - **Race condition** — same-workspace VS Code + Electron open
    simultaneously might both call `crypto.randomUUID`. Loser's
    write is overwritten, both get slightly different startup
    lines. Same acceptable-in-practice tradeoff as the server-side
    change.
- **Migration**: users can restore old behavior by setting
  `ithyno.terminalStartup` to `"claude --continue"` explicitly.

## Related

- `openspec/changes/archive/2026-07-19-pty-startup-uses-project-session-id/`
  — the server-side change this mirrors.
- `openspec/changes/archive/2026-07-19-pty-startup-default-fresh-session/`
  — earlier step (fresh fallback instead of --continue).
