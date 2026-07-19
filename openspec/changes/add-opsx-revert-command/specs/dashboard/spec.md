# Delta: dashboard — add /opsx:revert slash command

## ADDED Requirements

### Requirement: Revert Slash Command

The project SHALL provide a `/opsx:revert <scope>` slash command that a
worker or user runs inside Claude Code to open a Case α or Case β
revert change under the naming convention `revert-<scope>`. The
command SHALL enforce the PENDING annotation and (Case α only)
REVERTED annotation conventions documented in `CLAUDE.md` and
`.claude/skills/openspec-flow/SKILL.md`.

Concretely, when invoked, the command SHALL:

1. Take an optional `<scope>` argument (kebab-case). If omitted, the
   command SHALL prompt the user for a scope description and derive
   the kebab-case id from it (same pattern as `/opsx:propose`).
2. Prompt the user for the target requirement(s) to revert. Multiple
   targets per capability are allowed; multiple capabilities are
   allowed.
3. For each target, classify Case α (target's ADDED delta has already
   reached `openspec/specs/<capability>/spec.md`) or Case β (target
   still in-flight in `openspec/changes/<target-id>/`).
4. Run `openspec new change revert-<scope>` and populate:
   - `proposal.md` with a `## Why` narrative and a `## Targets`
     list citing each target by id and its Case α / β classification;
   - `specs/<capability>/spec.md` with `## REMOVED Requirements` or
     `## MODIFIED Requirements` sections (Case α) or
     `## ADDED Requirements` describing the post-revert baseline
     (Case β);
   - `tasks.md` with a checklist of standard revert steps
     (spec deltas, impl reverts, target annotations, verification).
5. Insert `> ⚠️ **PENDING REMOVAL** by [revert-<scope>](path)` (or
   `PENDING MODIFICATION`) directly beneath the affected
   `### Requirement:` heading in the current
   `openspec/specs/<capability>/spec.md` for every target.
6. For Case α only, insert `> **REVERTED** by [revert-<scope>](path)`
   (or `PARTIALLY REVERTED` when only a subset of the target's
   requirements is affected) at the top of every archived target's
   `proposal.md`, immediately after the closing frontmatter delimiter.
7. Run `npm run openspec -- validate revert-<scope>` and report the
   result. If invalid, the command SHALL surface the error and
   stop before any git action.

The command SHALL NOT invoke `git commit`, `openspec archive`, or
any destructive action — the resulting change goes through the
standard `/opsx:apply` → `/ithy-opsx:archive` flow like any other.

#### Scenario: `/opsx:revert kanban-ui-lanes` (Case α, no argument prompt)
- **GIVEN** `openspec/specs/dashboard/spec.md` contains a landed
  requirement `Kanban Phase Swim Lanes`
- **AND** the user has determined they want to revert it
- **WHEN** the user invokes `/opsx:revert kanban-ui-lanes` and confirms
  the target selection
- **THEN** `openspec/changes/revert-kanban-ui-lanes/proposal.md`,
  `specs/dashboard/spec.md`, and `tasks.md` are created;
  a PENDING REMOVAL blockquote is inserted directly under
  `### Requirement: Kanban Phase Swim Lanes` in the current spec;
  the archived target proposal is annotated with a REVERTED blockquote;
  and `openspec validate revert-kanban-ui-lanes` reports VALID.

#### Scenario: Case β target — archived-target archive procedure
- **GIVEN** an in-flight change `openspec/changes/add-foo/` that has
  not yet been archived
- **WHEN** the user invokes `/opsx:revert foo` and picks the in-flight
  change as the target
- **THEN** the command SHALL follow the "Reverted-target archive
  (Case β)" procedure documented in
  `.claude/skills/openspec-flow/SKILL.md` — the target's
  `outcome.md` is rewritten to point at the revert, its
  `specs/` directory is deleted, and the revert's delta uses ADDED
  headers describing the post-revert baseline

#### Scenario: Command aborts on validation failure
- **GIVEN** the user typed an invalid scope containing a slash
- **WHEN** the command runs `openspec new change`
- **THEN** the CLI's error surfaces to the user
- **AND** no PENDING or REVERTED annotations are inserted anywhere
