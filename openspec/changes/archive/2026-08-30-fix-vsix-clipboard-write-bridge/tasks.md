## 1. Clipboard bridge contract

- [x] 1.1 Add correlated clipboard-write request and response message types to the dashboard bridge.
- [x] 1.2 Forward clipboard-write requests through the VS Code webview HTML parent bridge.
- [x] 1.3 Handle clipboard-write requests in the Extension Host with `vscode.env.clipboard.writeText()` and return success or failure.

## 2. Dashboard copy integration

- [x] 2.1 Use the VS Code clipboard-write bridge for copy controls when the dashboard runs in the VSIX channel.
- [x] 2.2 Keep browser and Electron copy controls on the existing `navigator.clipboard` path.
- [x] 2.3 Apply only the current correlated response and preserve the existing copied state and error toast behavior.

## 3. Regression coverage and verification

- [x] 3.1 Test successful and rejected Extension Host clipboard writes and generated webview message routing.
- [x] 3.2 Test that browser and Electron paths do not emit VS Code clipboard messages and stale responses are ignored.
- [x] 3.3 Run the focused tests, typecheck, and VSIX build verification.
