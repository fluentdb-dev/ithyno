# Purpose

Provide one-click recovery and shell-aware session reload when authentication fails or sessions expire.

## MODIFIED Requirements

### Requirement: Session Expired Recovery

The dashboard SHALL surface authentication failures as a single full-page banner with a clear path back to a working session, including an explicit primary "Reload Dashboard" action button that restores access across Web, Electron, and VS Code extension shells.

#### Scenario: 401 or 403 from the server

- **WHEN** a mutating call returns 401 or 403 with an auth-related reason
- **THEN** the UI shows a "Session expired" banner with a primary "Reload Dashboard" action button
- **AND** clicking "Reload Dashboard" reloads or refreshes the session for the current UI shell
