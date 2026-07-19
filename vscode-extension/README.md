# OpenSpec UI — VS Code extension

Opens the OpenSpec dashboard inside VS Code as a webview panel. The active
workspace folder is used as the OpenSpec project root; the extension spawns
the existing Fastify server on a free localhost port and hosts the React UI
in a panel beside the editor.

Commands exposed:

- **ithyno: Show Dashboard** (`ithyno.show`) — opens the dashboard for the
  current workspace folder.
- **ithyno: New Project** (`ithyno.newProject`) — scaffolds a fresh
  ithyno project without leaving VS Code. See below.

## Install from VSIX

1. Build the VSIX from a checkout of the monorepo:
   ```bash
   npm install
   npm --workspace=vscode-extension run package
   ```
   This produces `vscode-extension/ithyno.vsix`.

2. In VS Code, open the Extensions view (⇧⌘X / Ctrl+Shift+X) → click the
   `⋯` menu → **Install from VSIX…** → pick the file.

3. Open a folder that contains an `openspec/` directory, then run
   **OpenSpec UI: Show Dashboard** from the Command Palette.

## Development loop (F5)

Open `vscode-extension/` as the VS Code workspace root and press **F5** to
launch an Extension Development Host. The build is TypeScript → `out/`; run
`npm --workspace=vscode-extension run watch` in a background terminal to
recompile on save.

## How it works

- On `openspecUI.show`, the extension picks a free port and spawns
  `bin/ithyno.js` with `OPENSPEC_PROJECT_ROOT=<workspace-folder>`,
  `PORT=<picked>`, `OPENSPEC_OPEN=0`.
- It polls `/api/health` (50ms, 5s cap) and captures the session token
  printed on stdout, then opens a webview panel loading
  `http://127.0.0.1:<port>/?token=…&vscode=1`.
- The embedded xterm.js pane is not mounted in this shell. Apply / Archive /
  Merge / Discard / Run buttons route through the extension host to a
  managed VS Code Terminal named **OpenSpec UI** (`cwd` = workspace folder).
- On panel disposal or extension deactivate the spawned server is
  `SIGTERM`'d.

## New Project (`ithyno.newProject`)

Command Palette → **ithyno: New Project** walks a folder picker → optional
subdirectory name → onboarding panel that shows scaffold + `openspec init`
progress live. On completion, clicking **Open Project** invokes
`vscode.openFolder` which **reloads the current VS Code window** into the
new project. After the reload, run `ithyno: Show Dashboard` to open the
dashboard in the new project.

- The picked folder is the *parent*; leave the subdir empty to use the
  picked folder itself as the project root.
- The onboarding panel spawns a short-lived server that disposes when
  the panel closes (or when `Open Project` triggers the reload).
- If you close the panel mid-init, the scaffold subprocess is not
  killed — the target folder may be left partially initialized. Delete
  it and re-run if that happens.

## Terminal auto-launch (`ithyno.terminalStartup` / `ithyno.autoLaunchTerminal`)

Two knobs govern the injected "ithyno" VS Code Terminal:

- **`ithyno.autoLaunchTerminal`** (boolean, default `true`) — when
  `true`, opening the dashboard immediately creates the terminal and
  fires the startup command (parity with Electron/browser). When
  `false`, the terminal is created lazily on the first button press
  (Apply / Archive / Merge / Run). Flip to `false` if you dislike the
  Terminal panel opening alongside the dashboard.
- **`ithyno.terminalStartup`** (string, default empty) — the startup
  command sent to the terminal when it's created:

- **Empty / unset (default)**: the extension auto-manages a
  per-project Claude Code session at
  `<workspace>/.ithyno/session-id`. First launch mints a UUID and
  runs `claude --session-id <uuid>`. Subsequent launches read the
  same UUID and run `claude --resume <uuid>`, resuming the
  conversation with its history intact. Delete `.ithyno/session-id`
  to reset (the next launch mints a new one). Add `.ithyno/` to your
  workspace's `.gitignore` — it's local state, not source of truth.
- **Non-empty override**: whatever you set in `ithyno.terminalStartup`
  is sent verbatim. Common choices: `claude` (fresh every time),
  `claude --continue` (legacy behavior), or any custom command.

## Limitations

- Multi-root workspaces use the first folder. A picker is future work.
- Marketplace publishing is not part of this release; only side-loading via
  VSIX is documented.
- The React app is hosted inside a nested iframe. Some VS Code webview
  features (theme inheritance, command palette interaction from the app)
  work less well across that boundary; a follow-up may serve assets via
  `webview.asWebviewUri` to remove the iframe.
