# windows-copilot-integration Specification

## Purpose
TBD - created by archiving change fix-windows-copilot-validation. Update Purpose after archive.
## Requirements
### Requirement: Copilot terminal compatibility on Windows

The Electron terminal SHALL render Copilot's full-screen interface and SHALL
allow users to navigate its timeline with the mouse wheel.

#### Scenario: Copilot uses its alternate screen

- **WHEN** Copilot switches terminal modes after startup
- **THEN** the terminal SHALL continue rendering output without a request-mode
  runtime exception

#### Scenario: User scrolls the Copilot timeline

- **WHEN** the terminal title identifies GitHub Copilot and mouse tracking is off
- **THEN** wheel movement SHALL send PageUp or PageDown input to Copilot

### Requirement: Copilot uses native OpenSpec Skills

Copilot Manager and worker prompts SHALL use the native `/openspec-*` Skill
identifiers for upstream OpenSpec operations.

#### Scenario: Code worker is invoked

- **WHEN** Copilot receives the code role
- **THEN** the prompt SHALL invoke `/openspec-apply-change <change-id>`

### Requirement: Copilot notification hooks preserve permissions

The installer SHALL configure notification and pre-tool hooks without granting
tool permission on the user's behalf.

#### Scenario: Pre-tool hook completes

- **WHEN** Copilot executes the ithyno `preToolUse` hook
- **THEN** the hook SHALL return no allow/deny decision and normal Copilot
  permission handling SHALL continue

