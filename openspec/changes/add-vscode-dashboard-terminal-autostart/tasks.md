# Tasks — add-vscode-dashboard-terminal-autostart

## 1. Spec delta

- [x] 1.1 Write ADDED `Dashboard Terminal Auto-launch` in
  `openspec/changes/add-vscode-dashboard-terminal-autostart/specs/vscode-extension/spec.md`

## 2. Config

- [x] 2.1 `vscode-extension/package.json`: add
  `ithyno.autoLaunchTerminal` property (boolean, default `true`)
- [x] 2.2 Description explains eager vs lazy behavior + config
  interaction with `ithyno.terminalStartup`

## 3. Extension code

- [x] 3.1 Extract `ensureTerminal(s)` helper from the current
  inline block in `pty.inject` handler
- [x] 3.2 In `ithyno.show` handler, after panel creation, if config
  `ithyno.autoLaunchTerminal` is `true`, call `ensureTerminal(s)`
  and `terminal.show(true)` (preserveFocus)
- [x] 3.3 Simplify `pty.inject` handler to call `ensureTerminal(s)`
  before sending

## 4. Docs

- [x] 4.1 `vscode-extension/README.md`: one paragraph under
  "Terminal auto-launch" describing the new config

## 5. Verify

- [x] 5.1 `openspec validate add-vscode-dashboard-terminal-autostart
  --strict` VALID
- [x] 5.2 `npm --workspace=vscode-extension run build` clean
- [x] 5.3 `npm test && npm run typecheck && npm run build` on root
  clean
- [x] 5.4 Manual VS Code smoke:
  - [x] 5.4.1 Fresh install; open a project; run
    `ithyno: Show Dashboard`
  - [x] 5.4.2 Confirm "ithyno" VS Code Terminal appears immediately
    with `claude --session-id <uuid>`
  - [x] 5.4.3 Confirm `.ithyno/session-id` exists
  - [x] 5.4.4 Close the dashboard, re-run `ithyno: Show Dashboard`
  - [x] 5.4.5 Confirm the terminal now uses `claude --resume <same-uuid>`
  - [x] 5.4.6 Set `ithyno.autoLaunchTerminal: false`, reload
  - [x] 5.4.7 Open dashboard → no terminal appears until a Run
    button is pressed

## 6. Post-impl

- [x] 6.1 `outcome.md`
- [ ] 6.2 `/ithy-opsx:archive add-vscode-dashboard-terminal-autostart`
