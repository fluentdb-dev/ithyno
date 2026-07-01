## ADDED Requirements

### Requirement: Execution Field on ProposalDoc
The proposal parser SHALL read an optional `execution` field from the
proposal frontmatter and expose it on `ProposalDoc` as
`execution?: "worktree" | "terminal"`, canonicalizing case and treating
unrecognized values as unset.

#### Scenario: `execution: worktree` in frontmatter
- **WHEN** a proposal declares `execution: worktree` in its YAML frontmatter
- **THEN** `ProposalDoc.execution` is `"worktree"`

#### Scenario: Mixed case
- **WHEN** a proposal declares `execution: WorkTree`
- **THEN** `ProposalDoc.execution` is `"worktree"` (canonicalized)

#### Scenario: Unrecognized value
- **WHEN** a proposal declares `execution: sandbox` or any string outside the recognized set
- **THEN** `ProposalDoc.execution` is undefined (the picker takes over)

#### Scenario: Missing field
- **WHEN** the frontmatter does not include an `execution` key
- **THEN** `ProposalDoc.execution` is undefined
