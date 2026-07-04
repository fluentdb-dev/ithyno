## MODIFIED Requirements

### Requirement: Archive Action Command
The dashboard's Archive action SHALL inject
`/ithy-opsx:archive <change-id>` into the embedded terminal when
`commandStyle === "claude"`, so the Claude-driven flow runs the full
archive + git-commit sequence via the ithy-opsx-archive skill instead
of the bare `/opsx:archive` file-move. **The ithy-opsx-archive skill
SHALL block the archive when the change's `## Verification` section
contains unchecked items, unless the user explicitly opts out via
`skip verify: <reason>`, in which case the reason SHALL be recorded in
the archive commit as a `Verify: skipped — <reason>` trailer.** The
CLI-mode branch continues to inject `npx openspec archive <change-id>`
unchanged.

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

#### Scenario: Verify block on unchecked verification tasks
- **WHEN** `/ithy-opsx:archive <id>` is run against a change whose `tasks.md` has unchecked items under a section whose heading contains "Verif"
- **THEN** the skill halts at the preflight step with a message listing the unchecked verify items and the option to `skip verify: <reason>`
- **AND** no merge, archive, or commit action is taken until the user either completes the ticks or provides an explicit skip

#### Scenario: Skip-verify escape hatch records reason in commit
- **WHEN** the user responds `skip verify: <reason>` during the skill's verify step
- **THEN** the skill advances through commit + merge + archive
- **AND** the archive commit body contains the trailer `Verify: skipped — <reason>` on its own line (above `Tags:` if tags exist)

#### Scenario: Verified archives contain no skip trailer
- **WHEN** the user completes all verify ticks before Step 3
- **THEN** the archive commit body contains no `Verify:` trailer

#### Scenario: Non-verify unchecked items warn but do not block
- **WHEN** the change has unchecked items outside any `## Verification` section
- **THEN** the skill emits a warning listing them
- **AND** proceeds to the verify step without blocking (the existing warn behavior is preserved)
