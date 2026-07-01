## ADDED Requirements

### Requirement: Edit-in-progress Indication
The system SHALL signal that a change file is being written as soon as a streaming
external write begins, and SHALL clear the signal once the settled content is
re-parsed and broadcast.

#### Scenario: Streaming write begins
- **WHEN** an external process starts writing a change's file
- **THEN** the system emits a file-writing event identifying the change, without parsing partial content

#### Scenario: Write settles
- **WHEN** the write finishes and the change is re-parsed
- **THEN** the system broadcasts the updated change and the writing signal is cleared

#### Scenario: Own writes do not signal
- **WHEN** the server applies a surgical toggle
- **THEN** no file-writing signal is emitted for that write
