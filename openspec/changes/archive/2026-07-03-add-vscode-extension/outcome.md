## ✅ Worked

- Existing Fastify + React stack ports over unchanged. The extension is
  ~150 lines of TS across three files (`extension.ts`, `server-spawner.ts`,
  `webview-html.ts`) — everything else is composition.
- Runtime detection lived in exactly the two web files predicted:
  `web/src/api.ts` (branch in `injectPty`) and `App.tsx`/`ChangeDetail.tsx`
  (skip `<Terminal />` and the visibility toggle). `web/src/runtime/shell.ts`
  gained a `postToVsCode()` helper alongside the existing `isVsCodeShell()`.
- Existing `Origin` allow-list already included `vscode-webview://` prefix
  (added in a prior change), so no server-side auth work was needed.

## ⚠️ Surprises

- `acquireVsCodeApi()` is only injected into the **top-level webview
  document**, not the nested iframe. Since we host the React app inside an
  iframe, the iframe can't detect VS Code that way. Solution: the outer
  webview shell forwards `pty.*` messages via `vscode.postMessage()`, and
  the iframe URL carries `?vscode=1` so `shell.ts` can flip its runtime flag
  reliably. `postToVsCode()` uses `window.parent.postMessage()` for the
  iframe case and falls back to `acquireVsCodeApi()` if ever called from
  the top-level document.
- Session token bootstrap: the Fastify server prints
  `http://localhost:<port>/?token=<hex>` on stdout. Rather than adding an
  IPC channel, the spawner sniffs that line with a regex — simple, no
  contract change, and the token stays in-memory only.
- The VSIX must ship the openspec-ui monorepo files (`bin/`, `server/`,
  `web/dist/`, `templates/`, production `node_modules/`) because
  `bin/openspec-ui.js` spawns `tsx server/index.ts`. A `prepack.mjs` script
  stages those into `vscode-extension/host/` before `vsce package` runs.
  Final VSIX is ~17MB — above the design's 5-10MB estimate but acceptable
  for a dev tool.
- Two call sites (`App.tsx` and `ChangeDetail.tsx`) both derive
  `terminalAvailable` from the store. In VS Code mode the *store's* value
  reflects the spawned server's PTY backend, which is irrelevant — the
  extension host owns the terminal. Both files now override to `true` for
  action-button gating while a separate `embeddedTerminalAvailable` gates
  the xterm pane mount and its toggle button.

## 🔁 Differently

- The tasks named `web/src/runtime.ts` for the new symbols, but that file
  already exists (holds the session-token bootstrap). Extended
  `web/src/runtime/shell.ts` instead (which already had `isVsCodeShell()`).
- No `pty.result` reverse message channel implemented — v1 only needs the
  webview → extension direction. The bridge in `webview-html.ts` relays
  arbitrary parent → iframe messages, so adding a reply is trivial later.

## 🌱 Follow-ups

- **`add-vscode-extension-init-command`** — extension only works when the
  workspace has `openspec/` present. A command-palette entry that runs
  `openspec-ui init .` (the CLI landed in `add-init-command`) plus a
  followup `openspec init` prompt would close the "opened a fresh folder,
  what now?" gap. Depends on `add-init-command` finishing first so the
  binary the command shells out to actually exists.
- **Verification (9.1–9.4)**: needs an actual VS Code session. The VSIX
  builds cleanly (`npm --workspace=vscode-extension run package` produces
  `openspec-ui.vsix`). Manual smoke: install via *Install from VSIX…* →
  open a folder with `openspec/` → run `OpenSpec UI: Show Dashboard` → Run
  a TODO card → confirm command in the *OpenSpec UI* terminal → close panel
  → confirm server exits.
- **Marketplace publishing** — currently `publisher: "openspec-ui"` is a
  placeholder; a real publisher ID + `vsce publish` gating is its own
  change.
- **`webview.asWebviewUri`** — serve the built React assets directly from
  the extension bundle to remove the localhost iframe. Cleaner theme
  inheritance and command palette integration.
- **Multi-root picker** — currently first folder wins; a small quickpick
  when >1 folder is present would round it out.
- **VSIX size** — 17MB is dominated by production `node_modules`. Using
  `esbuild --bundle` to produce a single-file server would drop it to a
  few MB.
