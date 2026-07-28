## ADDED Requirements

### Requirement: PENDING annotation position for parser compatibility

Every `> ⚠️ **PENDING` annotation blockquote inserted into an existing requirement in `openspec/specs/<capability>/spec.md` SHALL appear **after** the requirement's SHALL/MUST body paragraph, not before it. The annotation SHALL still sit inside the requirement block (before any `#### Scenario:` header), so it remains visually attached to the requirement it annotates.

**Rationale**: openspec CLI (`parseRequirements` in `@fission-ai/openspec/dist/core/parsers/markdown-parser.js`) captures each requirement's `text` field as the FIRST non-empty line after the `### Requirement:` header. `RequirementSchema` then refuses `text` that lacks `SHALL` or `MUST`. If the annotation blockquote lands on that first line, the check rejects every requirement carrying an in-flight annotation — which cascades into unrelated `openspec archive <id>` calls, since the rebuild re-parses the whole capability spec after applying the delta.

CI SHALL enforce this position via a spec-lint test that walks `openspec/specs/**/spec.md`, extracts each requirement's first non-empty content line, and asserts the line contains `SHALL` or `MUST`. The test SHALL name the offending file, line, and requirement title when it fails.

#### Scenario: annotation after SHALL/MUST line passes rebuild validation
- **GIVEN** a requirement in `openspec/specs/dashboard/spec.md` whose body is `"The system SHALL do X."` followed by a `> ⚠️ **PENDING MODIFIED** by [change-id](path/): reason.` blockquote
- **WHEN** any unrelated change is archived via `openspec archive <id>`
- **THEN** the rebuild-validation step accepts the requirement
- **AND** `--no-validate` is NOT required

#### Scenario: annotation before SHALL/MUST line fails CI lint
- **GIVEN** a requirement whose first non-empty line is a `> ⚠️ **PENDING` blockquote (i.e., annotation precedes the SHALL/MUST body)
- **WHEN** the spec-lint test suite runs
- **THEN** the test fails with a message naming the offending file and requirement title
- **AND** the failure message includes the corrective action ("move the annotation to sit after the SHALL/MUST body paragraph")

#### Scenario: skill that inserts annotations uses the correct position
- **GIVEN** `/opsx:revert` (or any skill that inserts a PENDING annotation) generates a spec.md edit
- **WHEN** the annotation is inserted into an existing requirement
- **THEN** the annotation is placed after the last SHALL/MUST-containing paragraph, before any `#### Scenario:` header
- **AND** the CLAUDE.md hard-rule section references this position rather than the pre-body position

#### Scenario: no annotation at all — no-op
- **GIVEN** a requirement with no PENDING annotation
- **WHEN** the spec-lint test runs
- **THEN** the requirement passes trivially (first non-empty line IS the SHALL/MUST body)
