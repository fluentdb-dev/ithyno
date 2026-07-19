# OpenSpec UI — VS Code extension

Opens the OpenSpec dashboard inside VS Code as a webview panel. The active
workspace folder is used as the OpenSpec project root; the extension spawns
the existing Fastify server on a free localhost port and hosts the React UI
in a panel beside the editor.

Command exposed: **OpenSpec UI: Show Dashboard** (`openspecUI.show`).

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

## Terminal auto-launch (`ithyno.terminalStartup`)

The injected VS Code Terminal ("OpenSpec UI") auto-launches a startup
command so slash commands land in Claude Code's REPL. Behavior:

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
