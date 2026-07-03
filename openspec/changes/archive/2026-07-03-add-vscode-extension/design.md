## Context

The dashboard was built as a localhost server + browser UI. That choice paid
off three times over: the Fastify layer is local-only, the React UI talks to
it via plain `fetch` + WebSocket, and every feature added since (PTY,
agent-runner, tagging) inherits the same lifecycle assumptions. A VS Code
extension is the **smallest possible repackaging**: ship the existing server
inside the extension host, load the existing React UI inside a webview, and
delegate the one piece that doesn't fit a webview (the embedded terminal) to
VS Code's native one.

The earlier conversation already crystallized the terminal decision:
delegate. The rest of this design lives downstream of that choice.

## Goals / Non-Goals

**Goals:**
- A VSIX that, once installed, exposes `OpenSpec UI: Show Dashboard` and
  opens the same UI users get from `openspec-ui`.
- Workspace folder is the OpenSpec project root automatically.
- VS Code's terminal carries Apply / Archive / Merge / Discard / Run-Merge
  commands instead of our embedded xterm.js.
- No regressions in the standalone CLI: the existing path stays first-class.

**Non-Goals:**
- Marketplace publishing in v1. We ship a buildable `.vsix` and document
  side-loading; publishing is its own follow-up change.
- Multi-root workspaces with simultaneous OpenSpec projects. The initial
  workspace folder is used; switching is "close panel, change focus, run
  command again." A first-class multi-root flow is a later refinement.
- Replacing the Fastify+WebSocket layer with VS Code message passing. That
  would be a much bigger rewrite for less gain; the localhost server lives
  inside the extension host process, so the network never leaves the
  machine.
- A standalone Electron app. Discussed and parked; this change is the
  preferred packaging.
- Rewriting the React UI to use VS Code's webview UI toolkit. Our current
  CSS look stays.

## Decisions

### Server lifecycle

- On `activate()` the extension does **not** start the server yet — that
  keeps activation fast for users who don't open the dashboard.
- On first invocation of the `openspecUI.show` command, the extension:
  1. Resolves the active workspace folder (first folder if multi-root).
  2. Picks a free port via Node's `net.createServer().listen(0)` pattern.
  3. Spawns `bin/openspec-ui.js` as a child process with
     `OPENSPEC_PROJECT_ROOT=<workspace>`, `PORT=<picked>`,
     `OPENSPEC_OPEN=0` (do not pop a browser).
  4. Waits until `/api/health` returns 200 (poll, 50ms intervals, 5s
     timeout).
  5. Creates a `WebviewPanel` (column: Beside) loading the spawned URL.
- On `deactivate()` the child process gets `SIGTERM`.

### Terminal delegation

- The extension maintains a `vscode.Terminal` named "OpenSpec UI" with
  `cwd: workspaceRoot`. It's created on first inject and reused thereafter.
- Webview ↔ extension messages:
  ```ts
  // webview → extension
  { type: "pty.inject", data: string, terminate?: boolean }
  // extension → webview (optional, for surfacing "no active terminal" cases — but
  // we always have one since we create it on demand, so this is reserved for
  // future failures)
  { type: "pty.result", ok: boolean, reason?: string }
  ```
- `terminal.sendText(data, terminate ?? true)` is the exact analog of our
  existing `/api/pty/inject` semantics.

### Runtime detection in the web app

- A single module (`web/src/runtime.ts`) exports
  `isVscodeRuntime` (a constant computed once at module load).
- `injectPty()` branches on this constant: webview → postMessage, browser →
  HTTP.
- `<Terminal />` mount in `App.tsx` is wrapped in `!isVscodeRuntime`.
- Toasts, kanban buttons, Run/Apply/Archive/Merge — none of those care
  about the runtime; they go through `injectPty()` which abstracts it.

### Webview content security

- `WebviewPanel.webview.options = { enableScripts: true,
  localResourceRoots: [] }`.
- The webview HTML is a minimal shell that points an `<iframe>` (or just
  navigates) to `http://localhost:<port>/`. VS Code allows iframe-loaded
  localhost in webviews when `enableScripts` is on.
- We *could* serve the built React assets directly from the extension
  bundle via `webview.asWebviewUri`, skipping localhost for the UI itself
  and keeping localhost only for `/api` + `/ws`. That's cleaner but bigger;
  the localhost-iframe shape is fine for v1.

### Workspace folder resolution

- If no folder is open, the command shows an error toast: "Open a folder
  first."
- For multi-root workspaces, the first folder wins. A small picker is
  future work and documented as Non-Goal.

### Packaging

- A separate `vscode-extension/` workspace package with its own
  `package.json`. Reasoning: the top-level package depends on Vite, React,
  Fastify, xterm.js, etc.; the extension depends on those + `@types/vscode`
  + `@vscode/vsce`. Keeping them split avoids `vsce`-irrelevant deps
  bleeding into the extension and makes the VSIX small.
- Build pipeline:
  ```
  npm --workspace=vscode-extension run build   # tsc → out/
  npm --workspace=vscode-extension run package # vsce → .vsix
  ```
- The extension `package.json` `files` includes the compiled `out/` plus
  the top-level `bin/` + `server/` + `web/dist/` + `templates/` (which it
  needs to spawn the server). Those get bundled as part of the VSIX.

### Standalone CLI invariance

- `bin/openspec-ui.js` and `server/index.ts` learn nothing about VS Code.
- The extension calls the same binary the standalone user does, with the
  same env vars. If the binary ever changes its contract, the extension is
  the only call site affected.

## Risks / Trade-offs

- **Bundle size of the VSIX.** Shipping `node_modules` for Fastify, chokidar,
  node-pty, and so on inflates the package. Mitigation: configure
  `vscode-extension` to declare those as `dependencies` (not bundled) and
  use `vsce`'s standard npm install. Final VSIX should land in the
  5–10 MB range, acceptable for a developer tool.
- **Web UI rendered inside iframe.** Some VS Code webview features (theme
  inheritance, command palette interaction) work less well across an
  iframe boundary. Acceptable for v1; the path forward is serving assets
  via `webview.asWebviewUri`, listed as future work.
- **`node-pty` is unused in VS Code mode but still bundled.** Because the
  server module loads it lazily and gracefully falls back, this only costs
  bundle bytes — the dashboard still boots even if `node-pty` failed to
  build for a target platform. Acceptable.
- **Workspace folder change mid-session.** If the user switches workspaces
  while the panel is open, the spawned server keeps watching the old
  folder. v1 shows stale state; the user closes the panel and re-runs the
  command. A folder-change listener is a later refinement.
- **Port collision.** Random free port avoids this almost entirely; the
  edge case is a system that runs out of ports, which is operationally
  weird and not worth handling specifically.
- **VS Code Terminal panel must be open to see output.** When the
  extension calls `terminal.show()` it auto-opens, so this is a non-issue
  in practice.
