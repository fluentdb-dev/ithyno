# Delta: project-init — .gitignore also excludes `.ithyno/`

## MODIFIED Requirements

### Requirement: .gitignore Maintenance

The system SHALL ensure both `.worktrees/` AND `.ithyno/` appear in
the target project's `.gitignore`, creating the file if necessary
and otherwise appending only the lines that are missing. Both
entries are project-local state and MUST NOT be committed:

- `.worktrees/` — agent worktree scratch directories.
- `.ithyno/` — project-local ithyno state, including the per-project
  Claude Code session UUID (`.ithyno/session-id`) added by
  `pty-startup-uses-project-session-id`.

The append-only-if-missing check SHALL be per-line. Adding one line
does NOT remove or reorder the other. A `.gitignore` that already
has both lines SHALL be reported as `already-present`.

#### Scenario: Create fresh gitignore with both lines
- **WHEN** `.gitignore` does not exist and the caller invokes `updateGitignore`
- **THEN** the file is created with both `.worktrees/` and `.ithyno/`, one per line, each terminated with `\n`

#### Scenario: Append `.ithyno/` when only `.worktrees/` exists
- **GIVEN** `.gitignore` contains `.worktrees/` but not `.ithyno/`
- **WHEN** `updateGitignore` runs
- **THEN** `.ithyno/` is appended (preserving prior content, including any trailing newline behavior)
- **AND** the file ends with a single trailing `\n`

#### Scenario: Append `.worktrees/` when only `.ithyno/` exists
- **GIVEN** `.gitignore` contains `.ithyno/` but not `.worktrees/`
- **WHEN** `updateGitignore` runs
- **THEN** `.worktrees/` is appended

#### Scenario: Both lines already present
- **WHEN** `.gitignore` already contains both `.worktrees/` and `.ithyno/`
- **THEN** the command leaves the file untouched and reports `already-present`

#### Scenario: Idempotent re-run
- **GIVEN** any starting `.gitignore` (or none)
- **WHEN** `updateGitignore` is invoked repeatedly
- **THEN** after the first call the file contains exactly one occurrence of `.worktrees/` and exactly one occurrence of `.ithyno/`; subsequent calls report `already-present` and do not modify the file

#### Scenario: Opt out
- **WHEN** the user passes `--no-gitignore` to `ithyno init` (or the equivalent programmatic `{ skipGitignore: true }`)
- **THEN** the command does not modify or create `.gitignore` at all — neither `.worktrees/` nor `.ithyno/` are added
