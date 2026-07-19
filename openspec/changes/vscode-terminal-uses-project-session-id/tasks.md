# Tasks — vscode-terminal-uses-project-session-id

## 1. Spec delta

- [x] 1.1 Write ADDED `Injected Terminal Startup Command` in
  `openspec/changes/vscode-terminal-uses-project-session-id/specs/vscode-extension/spec.md`

## 2. Config

- [x] 2.1 `vscode-extension/package.json`: change
  `ithyno.terminalStartup` default from `"claude --continue"` to `""`
- [x] 2.2 Update the setting's `description` to explain empty-
  string / explicit-override semantics

## 3. Extension code

- [x] 3.1 Add helper `resolveInjectedStartup(workspaceRoot,
  configValue)` in `vscode-extension/src/extension.ts` (or sibling)
- [x] 3.2 When config is empty, apply session-id logic
  (mint-or-resume against `.ithyno/session-id`)
- [x] 3.3 On file I/O failure, fall back to `claude` (fresh) +
  `console.warn`
- [x] 3.4 Update the existing call site to use the helper

## 4. Docs

- [x] 4.1 `vscode-extension/README.md`: one paragraph on the new
  session-id auto-manage behavior and the config override

## 5. Verify

- [x] 5.1 `openspec validate vscode-terminal-uses-project-session-id
  --strict` VALID
- [x] 5.2 `npm --workspace=vscode-extension run build` clean
- [x] 5.3 `npm test && npm run typecheck && npm run build` on the
  root clean
- [ ] 5.4 Manual (best-effort — VS Code smoke pending user)

## 6. Post-impl

- [x] 6.1 `outcome.md`
- [ ] 6.2 `/ithy-opsx:archive vscode-terminal-uses-project-session-id`
