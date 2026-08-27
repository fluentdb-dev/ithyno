## 1. Focus Recovery Semantics

- [x] 1.1 Replace the boolean authentication probe result with explicit valid, unauthorized, and unavailable outcomes.
- [x] 1.2 Change App focus and visibility recovery so a healthy connected dashboard performs no workspace reload.
- [x] 1.3 Recover only a disconnected dashboard, coalesce simultaneous focus/visibility events, and reload the containing shell only after explicit authentication rejection.
- [x] 1.4 Keep the active route mounted while disconnected recovery refreshes workspace state.

## 2. Dialog Continuity Coverage

- [x] 2.1 Add unit tests for healthy, disconnected, unauthorized, and unavailable recovery decisions.
- [x] 2.2 Add a UI regression test that opens a dialog, enters unsaved text, simulates healthy focus restoration, and confirms the dialog and text remain unchanged.
- [x] 2.3 Remove or revise the previous loading-mode-only regression test so it no longer represents route preservation as complete focus-recovery coverage.

## 3. VS Code Clipboard Bridge

- [x] 3.1 Define request/response message types for reading clipboard text through the VS Code shell.
- [x] 3.2 Add dashboard-side VS Code paste handling for focused `input` and `textarea` controls, including selection replacement and stale-response rejection.
- [x] 3.3 Update the outer webview bridge to forward clipboard requests and responses between the nested iframe and Extension Host.
- [x] 3.4 Handle clipboard read requests in the Extension Host with `vscode.env.clipboard.readText()` and return the correlated result to the requesting webview.
- [x] 3.5 Preserve native browser and Electron paste behavior without emitting VS Code clipboard messages.

## 4. Clipboard Tests

- [x] 4.1 Add tests for inserting clipboard text at a caret and replacing a selected range in controlled form fields.
- [x] 4.2 Add tests proving stale clipboard responses do not modify a different or detached field.
- [x] 4.3 Add tests for generated VS Code webview HTML and Extension Host message routing for the clipboard contract.

## 5. Verification

- [x] 5.1 Run the focused web and VS Code extension test suites.
- [x] 5.2 Run `npm run typecheck`, `npm test`, and `npm run build`.
- [ ] 5.3 Build a VSIX from the fresh web bundle and manually verify that switching windows leaves an Agent configuration dialog and its typed values intact.
- [ ] 5.4 In the packaged VSIX, paste a model argument into the Agent dialog with `Cmd+V` on macOS and `Ctrl+V` on Windows or Linux as available.

## 6. Cross-platform VSIX Runtime

- [x] 6.1 Normalize bundled macOS and Linux esbuild binaries to executable mode after staging dependencies and before creating the VSIX.
- [x] 6.2 Add regression coverage for direct and nested esbuild package layouts while leaving Windows executables unchanged, and fail prepack if expected POSIX packages are absent.
