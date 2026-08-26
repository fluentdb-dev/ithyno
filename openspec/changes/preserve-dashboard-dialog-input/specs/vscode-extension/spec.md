## ADDED Requirements

### Requirement: VS Code Webview Dialog Clipboard Paste

The VS Code extension SHALL allow users to paste system clipboard text with the platform paste shortcut into a focused dashboard `input` or `textarea`, including fields inside modal dialogs hosted by the nested dashboard iframe.

When the nested webview cannot reliably perform native paste, the extension SHALL provide a clipboard request/response bridge backed by `vscode.env.clipboard.readText()`. The bridge MUST preserve the focused field's existing value outside the selected range and MUST notify controlled form state of the inserted value.

#### Scenario: Paste a model name into Agent Args

- **GIVEN** the packaged VSIX dashboard has an Agent configuration dialog open
- **AND** the Args field is focused with an insertion caret
- **WHEN** the user presses `Cmd+V` on macOS or `Ctrl+V` on Windows or Linux with `--model sonnet` on the clipboard
- **THEN** the Args field receives `--model sonnet` at the caret
- **AND** saving the dialog uses the pasted value

#### Scenario: Replace selected dialog text

- **GIVEN** a focused dashboard text field contains selected text
- **WHEN** the VS Code clipboard bridge returns pasted text
- **THEN** only the selected range is replaced
- **AND** text before and after the selection is preserved

#### Scenario: Focus changes before clipboard response

- **GIVEN** a clipboard read request is pending for a dialog field
- **WHEN** that field is removed or loses ownership before the response arrives
- **THEN** the stale response does not modify another field
- **AND** the extension does not throw an uncaught error

#### Scenario: Non-VS Code shells retain native paste

- **GIVEN** the dashboard is running in a browser or Electron
- **WHEN** the user uses the platform paste shortcut in a text control
- **THEN** the browser's native paste behavior is used
- **AND** no VS Code clipboard request is emitted
