## ADDED Requirements

### Requirement: Serve Worktree Version of a Change
`GET /api/changes/:id` SHALL accept an optional `tree=worktree` query
parameter that, when present, causes the server to read the change from
`.worktrees/<change-id>/openspec/changes/<change-id>/` instead of the
main-tree openspec directory — so the dashboard can render whatever
the running agent has produced without having to wait for the branch
to be merged.

#### Scenario: Worktree exists
- **WHEN** the client requests `/api/changes/foo?tree=worktree` and `.worktrees/foo/openspec/changes/foo/` exists
- **THEN** the server returns the parsed `Change` shape (same schema as the main-tree endpoint) with the worktree's proposal, tasks, design, and delta specs

#### Scenario: Worktree missing
- **WHEN** the client requests `/api/changes/foo?tree=worktree` but no `.worktrees/foo/` directory exists
- **THEN** the server returns 404 with a body explaining the fallback: `{ "error": "no worktree at .worktrees/foo. The plain URL /change/foo shows the main-tree view." }`

#### Scenario: No query param preserves existing behavior
- **WHEN** the client requests `/api/changes/foo` without the `tree` param
- **THEN** the server returns the main-tree change exactly as today (no regression)

### Requirement: ChangeDetail URL-Driven Tree Switch
The ChangeDetail route SHALL read the `tree` URL search param and
render the worktree version of the change when `tree=worktree` is
present, so the URL is the single source of truth for which tree is
being viewed.

#### Scenario: URL with `?tree=worktree` renders worktree content
- **WHEN** the user navigates to `/change/foo?tree=worktree`
- **THEN** the page fetches from `/api/changes/foo?tree=worktree` and displays that change (tasks, proposal, delta specs) instead of the store's main-tree copy

#### Scenario: Plain URL renders main-tree content
- **WHEN** the user navigates to `/change/foo`
- **THEN** the page renders `state.changes.find(c => c.id === "foo")` as today; no new fetch is performed for the main-tree case

#### Scenario: 404 falls back to main tree
- **WHEN** the worktree fetch returns 404 (worktree gone / never existed)
- **THEN** the page renders the main-tree change with a non-blocking notice `"worktree gone — showing main tree"`; the URL is not rewritten so a page refresh retries

### Requirement: Kanban Card Link Uses Worktree URL When Appropriate
The Kanban `ChangeCard` component SHALL append `?tree=worktree` to its
navigation link when the change has an active worktree, so clicking a
running / mergeable card lands the user on the state they were watching
on the board.

#### Scenario: Active worktree → worktree URL
- **WHEN** the card renders for a change whose latest job is `running`, or whose worktree is awaiting merge/discard
- **THEN** the card's `<Link>` `to` prop is `/change/<id>?tree=worktree`

#### Scenario: No active worktree → plain URL
- **WHEN** the card renders for a TODO change, a DONE change, or one whose worktree has been merged/discarded
- **THEN** the card's `<Link>` `to` prop is `/change/<id>` (no query param)

### Requirement: Switch-to-Main Affordance in ChangeDetail Head
When ChangeDetail is rendering the worktree view, the page head SHALL
show a pill labelled `viewing worktree` that links to the same change
without the `tree` query param, so the user can toggle between the
worktree and the main-tree view.

#### Scenario: Worktree view shows the pill
- **WHEN** the URL contains `tree=worktree`
- **THEN** the pill renders with the label `viewing worktree` and clicking it navigates to `/change/<id>`

#### Scenario: Main view hides the pill
- **WHEN** the URL has no `tree` param
- **THEN** the pill does not render; there is no toggle-to-worktree affordance from this page (the Kanban card is the entry point)
