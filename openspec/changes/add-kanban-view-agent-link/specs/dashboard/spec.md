## MODIFIED Requirements

### Requirement: Kanban Agent Badge and ChangeDetail Header Link to Agents Page

The dashboard SHALL provide a direct navigation link from the Kanban card's `AgentBadge` and the `ChangeDetail` header to the Agents page's output tab for the associated job. The link uses the existing URL
contract `/agents?job=<jobId>&tab=output`. Both affordances SHALL
appear whenever a job is associated with the change (any status:
running, completed, crashed, cancelled, orphaned) and be omitted
when no job has ever run for the change.

#### Scenario: Kanban badge is a clickable link
- **GIVEN** a change `X` has an agent job in any status (running / completed / crashed / cancelled / orphaned)
- **WHEN** the Kanban card for `X` renders
- **THEN** the `AgentBadge` (`● <agent-name>`) is wrapped in a `<Link>` targeting `/agents?job=<jobId>&tab=output`
- **AND** hovering the badge shows a visual affordance (underline or chevron) indicating it is clickable
- **AND** clicking the badge navigates to the Agents page's output tab for that specific job

#### Scenario: ChangeDetail header shows the same link
- **GIVEN** the same precondition
- **WHEN** the user navigates to `/change/X`
- **THEN** the ChangeDetail header near the progress bar renders `● <agent-name> · view agent` as a `<Link>` targeting the same `/agents?job=<jobId>&tab=output`
- **AND** clicking it lands at the same Agents-page destination

#### Scenario: No badge / no link when no agent exists
- **GIVEN** a change `Y` that has never had an agent run
- **THEN** the Kanban card renders no `AgentBadge`
- **AND** the ChangeDetail header renders no "view agent" link
- **AND** nothing is broken by the absence

#### Scenario: Card click is not hijacked by badge click
- **GIVEN** a Kanban card with an active agent badge
- **WHEN** the user clicks the badge
- **THEN** the click's `stopPropagation` prevents the card's own click handler (navigate to `/change/<id>`) from firing
- **AND** only the Agents-page navigation happens

#### Scenario: Card click still routes to ChangeDetail
- **WHEN** the user clicks anywhere on the Kanban card OUTSIDE the badge
- **THEN** the card's existing navigation to `/change/<id>` fires as before
- **AND** the Agents page is not opened
