# Tasks — add-vscode-extension-new-project

## 1. Spec delta

- [x] 1.1 Write ADDED `New Project Command` in
  `openspec/changes/add-vscode-extension-new-project/specs/vscode-extension/spec.md`
- [x] 1.2 Decide during impl whether `dashboard` capability needs a
  MODIFIED delta for the iframe-safe onboarding channel change; add
  if yes

## 2. Command contribution

- [x] 2.1 `vscode-extension/package.json`: add
  `contributes.commands` entry for `ithyno.newProject` (title
  `ithyno: New Project`, category `ithyno`)
- [x] 2.2 Add `onCommand:ithyno.newProject` to `activationEvents`

## 3. Extension code

- [x] 3.1 Add `ithyno.newProject` command registration in
  `vscode-extension/src/extension.ts`
- [x] 3.2 Folder picker via `showOpenDialog` + optional subdir
  prompt via `showInputBox`
- [x] 3.3 Target-path derivation (empty subdir → picked; non-empty
  → `<picked>/<subdir>`)
- [x] 3.4 Spawn a short-lived onboarding server via `spawnServer`
  pointing at the target's parent directory
- [x] 3.5 Create the onboarding `WebviewPanel` loading
  `<server>/onboarding?target=<path>&channel=vscode`
- [x] 3.6 `panel.webview.onDidReceiveMessage` handler:
  - [x] 3.6.1 `onboarding-open` → validate absolute path + parent
    exists + no traversal → `vscode.openFolder`
  - [x] 3.6.2 `onboarding-close` → dispose panel
  - [x] 3.6.3 Ignore other message types
- [x] 3.7 `panel.onDidDispose` → dispose the onboarding server

## 4. Webview HTML bridge

- [x] 4.1 Add `renderOnboardingHtml(serverUrl, target)` to
  `vscode-extension/src/webview-html.ts` (or new sibling)
- [x] 4.2 Bridge: forward `onboarding-*` messages iframe↔host

## 5. Iframe-safe onboarding channel (`web/src/lib/onboardingChannel.ts`)

- [x] 5.1 When `channel === "vscode"` AND `window !== window.parent`
  AND `acquireVsCodeApi` is NOT a function, use
  `window.parent.postMessage(msg, "*")` instead
- [x] 5.2 Same for `openProject` and `closeOnboarding`

## 6. Docs

- [x] 6.1 `vscode-extension/README.md`: one paragraph on the new
  command + the "reload happens on Open Project" behavior

## 7. Verify

- [x] 7.1 `openspec validate add-vscode-extension-new-project
  --strict` VALID
- [x] 7.2 `npm --workspace=vscode-extension run build` clean
- [x] 7.3 `npm test && npm run typecheck && npm run build` on root
  clean
- [x] 7.4 Manual VS Code smoke:
  - [x] 7.4.1 F5 Extension Development Host
  - [x] 7.4.2 Command Palette → `ithyno: New Project`
  - [x] 7.4.3 Pick a scratch parent folder, name `test-vscode-newproj`
  - [x] 7.4.4 Onboarding page shows scaffold + openspec-init logs
  - [x] 7.4.5 On completion click "Open Project" → VS Code reloads
    into `test-vscode-newproj`
  - [x] 7.4.6 Run `ithyno: Show Dashboard` → confirm project loads
  - [x] 7.4.7 Run a change from Kanban → confirm injected terminal
    launches `claude --session-id <uuid>` (verifies
    `vscode-terminal-uses-project-session-id` task 5.4)
  - [x] 7.4.8 Check `test-vscode-newproj/.ithyno/session-id` file
    exists with a UUID

## 8. Post-impl

- [x] 8.1 `outcome.md`
- [ ] 8.2 `/ithy-opsx:archive add-vscode-extension-new-project`
- [x] 8.3 Retroactively tick task 5.4 in the archived
  `vscode-terminal-uses-project-session-id/tasks.md` (in place, since
  it's archived, add a note to that change's `outcome.md` follow-up
  section instead)
