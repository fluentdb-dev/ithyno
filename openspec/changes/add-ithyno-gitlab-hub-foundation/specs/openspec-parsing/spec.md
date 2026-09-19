## ADDED Requirements

### Requirement: Runtime-Independent Content Parsing
The system SHALL expose normalized OpenSpec parsing as runtime-independent functions that accept file identity and text content without requiring filesystem, watcher, HTTP, GitLab, or UI dependencies.

#### Scenario: Parse workstation content
- **WHEN** the workstation adapter supplies text read from an OpenSpec file
- **THEN** the shared parser produces the same normalized model and source-line metadata as the existing parser

#### Scenario: Parse GitLab content
- **WHEN** the hub adapter supplies the same file identity and text fetched through the GitLab repository API
- **THEN** the shared parser produces an equivalent normalized model without checking out the repository

### Requirement: Parser Extraction Compatibility
The extracted parser SHALL preserve existing parse-error fallback, task line numbering, delta kinds, archive metadata, and path-independent identifiers.

#### Scenario: Existing parser fixtures run through shared package
- **WHEN** the current parser fixture corpus is executed against the extracted API
- **THEN** its normalized outputs and parse errors match the pre-extraction behavior
