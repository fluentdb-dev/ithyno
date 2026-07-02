## MODIFIED Requirements

### Requirement: Archive Action Command
The dashboard's Archive action SHALL inject
`/ithy-opsx:archive <change-id>` into the embedded terminal when
`commandStyle === "claude"`, so the Claude-driven flow runs the full
archive + git-commit sequence via the ithy-opsx-archive skill instead
of the bare `/opsx:archive` file-move. The CLI-mode branch continues
to inject `npx openspec archive <change-id>` unchanged.

#### Scenario: Claude-mode archive uses ithy-opsx
- **WHEN** the user confirms an Archive action while `commandStyle === "claude"`
- **THEN** the exact byte sequence `/ithy-opsx:archive <change-id>` is written to the embedded terminal

#### Scenario: CLI-mode archive is unchanged
- **WHEN** the user confirms an Archive action while `commandStyle === "cli"`
- **THEN** the exact byte sequence `npx openspec archive <change-id>` is written to the embedded terminal

#### Scenario: Command modal preview reflects the switch
- **WHEN** the Archive command modal renders with `commandStyle === "claude"`
- **THEN** the preview shows `/ithy-opsx:archive <change-id>` and the submit label reads accordingly (e.g. `Send /ithy-opsx:archive`)

#### Scenario: Command modal preview for CLI mode
- **WHEN** the Archive command modal renders with `commandStyle === "cli"`
- **THEN** the preview shows `npx openspec archive <change-id>` (unchanged)
