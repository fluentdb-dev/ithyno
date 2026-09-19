## Why

The VSIX dashboard's copy buttons call the iframe's browser clipboard API directly, which can be rejected by the VS Code webview sandbox even after a user click. Users therefore see a clipboard permission error when copying change IDs or command previews.

## What Changes

- Route dashboard copy requests from the nested iframe through the VS Code webview and Extension Host clipboard bridge.
- Use `vscode.env.clipboard.writeText()` for VSIX copy operations and return an explicit success or failure response.
- Preserve the existing browser and Electron clipboard path.
- Add regression coverage for message routing and copy success/failure handling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `vscode-extension`: Require copy controls in the dashboard iframe to work through the Extension Host clipboard API.

## Impact

- Affects `web/src/components/ClipboardCopyButton.tsx`, the dashboard clipboard bridge, `vscode-extension/src/webview-html.ts`, and `vscode-extension/src/extension.ts`.
- Adds no dependencies and does not change server APIs or clipboard behavior in browser/Electron shells.
