## MODIFIED Requirements

### Requirement: Default Claude Agent Commits Its Work
The bundled Claude entry in `agents.yaml.example` SHALL declare an
`initialInput` of `/ithy-opsx:apply ${change_id}`, so worktree agents
that use the default configuration end their run with the
implementation committed on the agent branch — via the
`ithy-opsx-apply` skill's post-implementation commit step — rather
than leaving the worktree dirty for the archive skill's safety net
to clean up.

#### Scenario: Default agents.yaml uses `/ithy-opsx:apply`
- **WHEN** a user copies `agents.yaml.example` to `agents.yaml` unchanged
- **THEN** the bundled Claude entry's `initialInput` reads exactly `/ithy-opsx:apply ${change_id}`

#### Scenario: Custom `initialInput` values are unaffected
- **WHEN** a user has overridden the bundled entry with their own `initialInput` (e.g. `/opsx:apply ${change_id}` to opt out, or a project-specific prompt)
- **THEN** the runner uses whatever value the user set; no auto-substitution or upgrade

## ADDED Requirements

### Requirement: `/ithy-opsx:apply` Skill Commits After Implementation
The `.claude/skills/ithy-opsx-apply/SKILL.md` skill SHALL delegate the
implementation to `/opsx:apply <id>` and then, if the working tree is
dirty, stage and commit the changes on the current branch with an
auto-drafted message so the user reviews before it lands.

#### Scenario: Dirty tree after apply triggers a commit
- **WHEN** the skill runs `/opsx:apply <id>` and `git status --porcelain` reports uncommitted changes
- **THEN** the skill stages with `git add .`, drafts a message of the shape `agent: implement <id>\n\n<summary>`, presents it to the user, and runs `git commit -m "..."` with the approved message

#### Scenario: Clean tree skips the commit
- **WHEN** the apply step ends with `git status --porcelain` clean
- **THEN** the skill reports "clean tree, nothing to commit" and returns without invoking `git commit`

#### Scenario: Pre-commit hook rejects
- **WHEN** the `git commit` invocation fails because a pre-commit hook rejected
- **THEN** the skill reports the hook output verbatim and stops; it does NOT retry with `--no-verify`

#### Scenario: The archive safety net remains
- **WHEN** the apply skill exits with a clean commit
- **AND WHEN** the user later runs `/ithy-opsx:archive <id>`
- **THEN** the archive skill's step 2 ("commit the agent's uncommitted work") finds a clean tree and is a no-op — but the step is still present in the archive skill to catch users of non-Claude agents or interrupted apply runs
