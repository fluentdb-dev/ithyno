# codex-init-guidance Specification

## Purpose
TBD - created by archiving change align-codex-init-instructions. Update Purpose after archive.
## Requirements
### Requirement: Codex-compatible repository guidance on initialization

The initialization flow SHALL scaffold a root `AGENTS.md` from a
CLI-neutral template so that a project whose Manager is Codex has a
repository-local OpenSpec workflow contract. The guidance SHALL require a
proposal before a spec-level change, describe the validate → implement →
verify → outcome → archive lifecycle, and identify `openspec/changes/` as the
location of in-flight change artifacts.

The normal init path SHALL create `AGENTS.md` only when it is absent and SHALL
leave an existing user-authored file unchanged unless the caller explicitly
uses the existing force option.

#### Scenario: fresh Codex-managed project
- **GIVEN** a fresh git project with no `AGENTS.md`
- **WHEN** the user initializes it and selects Codex as the Manager
- **THEN** the project root contains `AGENTS.md` with the OpenSpec workflow
  contract
- **AND** `agents.yaml` declares `command: codex`

#### Scenario: existing instructions are preserved
- **GIVEN** a target project already contains a user-authored `AGENTS.md`
- **WHEN** init runs without force
- **THEN** the file is not modified and init reports it as skipped

#### Scenario: force refreshes generated guidance
- **GIVEN** a target project contains an existing `AGENTS.md`
- **WHEN** init runs with force
- **THEN** the file is replaced with the packaged instruction template

### Requirement: Codex is selectable for New Project initialization

The New Project Manager picker SHALL include Codex when doctor reports the
`codex` CLI is installed. Codex SHALL be labeled `(unverified)` until its
startup/resume strategy and dispatch command surface have executable
verification. Selecting Codex SHALL pass `codex` through the existing init
chain and write `agents.yaml` with `manager.command: codex`.

#### Scenario: detected Codex is offered
- **GIVEN** doctor reports Codex as installed
- **WHEN** the user opens New Project initialization
- **THEN** the Manager picker offers `Codex (codex) (unverified)`

#### Scenario: selecting Codex configures the new project
- **GIVEN** Codex is installed and selected in New Project initialization
- **WHEN** initialization completes
- **THEN** the generated `agents.yaml` Manager entry has `command: codex`
- **AND** the OpenSpec initialization chain receives `managerCli: "codex"`

### Requirement: Codex prompt-surface claims are verified

The project SHALL NOT represent a repository-local Codex prompt output as a
working initialized command surface unless an executable Codex integration
test verifies that Codex discovers and invokes it from that path. Project
initialization SHALL NOT write to a user's global `CODEX_HOME` merely to
install project guidance.

#### Scenario: unverified prompt path
- **GIVEN** no executable Codex smoke test covers a proposed local prompt path
- **WHEN** initialization runs for a Codex Manager
- **THEN** it supplies repository guidance through `AGENTS.md`
- **AND** it does not write global Codex prompt configuration
