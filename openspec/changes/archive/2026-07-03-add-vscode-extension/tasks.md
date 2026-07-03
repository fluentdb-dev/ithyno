## 1. Workspace package scaffolding
- [x] 1.1 Add `vscode-extension/` workspace to the root `package.json` (npm workspaces)
- [x] 1.2 Create `vscode-extension/package.json` (VS Code manifest: engines, activationEvents, contributes.commands, scripts)
- [x] 1.3 Add `vscode-extension/tsconfig.json` emitting to `out/`
- [x] 1.4 Devdeps in `vscode-extension/`: `@types/vscode`, `@vscode/vsce`, `typescript`

## 2. Extension entry
- [x] 2.1 `vscode-extension/src/extension.ts` registers the `openspecUI.show` command and exports `activate` / `deactivate`
- [x] 2.2 Resolve the active workspace folder (first folder of multi-root)
- [x] 2.3 Show an error toast when no folder is open
- [x] 2.4 Lazy: do not start the server in `activate`

## 3. Server spawner
- [x] 3.1 `vscode-extension/src/server-spawner.ts` picks a free port via Node's net helpers
- [x] 3.2 Spawn `bin/openspec-ui.js` with `OPENSPEC_PROJECT_ROOT`, `PORT`, `OPENSPEC_OPEN=0`
- [x] 3.3 Poll `/api/health` until 200 (50ms intervals, 5s timeout) before opening the panel
- [x] 3.4 On panel disposal or extension deactivate, `SIGTERM` the child

## 4. Webview shell
- [x] 4.1 `vscode-extension/src/webview-html.ts` returns the minimal HTML pointing at the spawned URL
- [x] 4.2 `WebviewPanel` opens beside the editor, retains context when hidden
- [x] 4.3 Enable scripts; minimal localResourceRoots

## 5. Terminal delegation
- [x] 5.1 Extension keeps a `vscode.Terminal` reference, lazily created on first inject
- [x] 5.2 Terminal name is "OpenSpec UI"; `cwd` is the workspace folder
- [x] 5.3 `panel.webview.onDidReceiveMessage` handles `pty.inject` by calling `terminal.sendText(data, terminate)` and `terminal.show()`

## 6. Web runtime branch
- [x] 6.1 New `web/src/runtime.ts` exporting `isVscodeRuntime` and the `vscode` postMessage handle
- [x] 6.2 `web/src/api.ts` `injectPty()` branches on the runtime
- [x] 6.3 `web/src/App.tsx` skips `<Terminal />` mount when runtime is VS Code
- [x] 6.4 Hide / suppress the "Hide terminal" toggle in VS Code runtime

## 7. Packaging
- [x] 7.1 npm script in `vscode-extension/package.json` for `tsc` build
- [x] 7.2 npm script for `vsce package` producing a `.vsix`
- [x] 7.3 README in `vscode-extension/` documenting install-from-VSIX and the dev loop (F5 launch)

## 8. Docs
- [x] 8.1 Update root README pointing at the VS Code extension as an installation path
- [x] 8.2 Update `docs/migration-guide.md` adding "Install via VS Code extension" as Stage 2 alternative

## 9. Verification
- [x] 9.1 Build the VSIX and install via "Install from VSIX..." in a fresh VS Code window
- [x] 9.2 Open a workspace with `openspec/` initialized → run `OpenSpec UI: Show Dashboard` → panel opens with the kanban
- [x] 9.3 Click Run on a TODO card → command appears in VS Code's terminal panel
- [x] 9.4 Close the panel → spawned server process exits within a few seconds
- [x] 9.5 Standalone CLI (`openspec-ui --dir ...`) still behaves identically to before this change
