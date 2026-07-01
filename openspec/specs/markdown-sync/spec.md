# markdown-sync Specification

## Purpose
Keep the browser dashboard and the on-disk OpenSpec Markdown in sync in both
directions, without ever rewriting a file wholesale, so AI agents and humans can
edit the same `.md` files concurrently.

## Requirements

### Requirement: Surgical Checkbox Edit
The system SHALL apply a task toggle by rewriting only the single state
character of the target checkbox line, leaving all other bytes — indentation,
list marker, task text, and continuation lines — untouched.

#### Scenario: Toggle preserves a multi-line task
- **WHEN** a task whose body spans an indented continuation line is checked
- **THEN** only `- [ ]` becomes `- [x]` and the continuation line is unchanged

#### Scenario: Marker normalization
- **WHEN** a task written as `- [X]` (uppercase) is unchecked
- **THEN** it is read as checked and rewritten as `- [ ]`

### Requirement: Optimistic Locking with Drift Recovery
The system SHALL guard writes with the file hash the client last observed, and
SHALL relocate the target line by its exact original text when the hash no
longer matches, so edits elsewhere in the file do not block the toggle.

#### Scenario: Hash matches (fast path)
- **WHEN** a toggle arrives whose baseHash equals the current file hash
- **THEN** the system edits the given line directly

#### Scenario: Lines inserted above the task
- **WHEN** the hash differs but the original line text is still found exactly once
- **THEN** the system relocates to that line and applies the edit without conflict

#### Scenario: Target task line itself was rewritten
- **WHEN** the hash differs and the original line text is no longer present
- **THEN** the system SHALL return a 409 conflict with the latest state and SHALL NOT write

### Requirement: Echo Suppression
The system SHALL ignore file-watcher events that result from its own writes, so a
toggle does not trigger a redundant re-parse and broadcast.

#### Scenario: Server write does not loop
- **WHEN** the server writes a toggle and the watcher reports that file
- **THEN** the system compares the on-disk hash to the recorded write hash and ignores the match

### Requirement: External Change Propagation
The system SHALL detect external edits to `.md` files and push the updated change
or spec to all connected clients over WebSocket.

#### Scenario: AI edits tasks.md
- **WHEN** an external process modifies a change's tasks.md
- **THEN** the system re-parses that change and broadcasts a change-updated event
