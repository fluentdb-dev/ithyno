## ADDED Requirements

### Requirement: Phase Persistence In Change Sidecar
The system SHALL persist a change's workflow phase as a `phase:` key
in the per-change sidecar file
`openspec/changes/<id>/.openspec.yaml`, accepting only the values
`proposed`, `coded`, `reviewed`, and `done` (plus `needs-human`,
governed by a separate capability), so that manual phase
assignments survive server restart without modifying `proposal.md`.

#### Scenario: phase survives restart
- **GIVEN** a change whose sidecar contains `phase: coded`
- **WHEN** the server restarts and rescans `openspec/changes/`
- **THEN** the change is reported with phase `coded` in `GET /api/state`

#### Scenario: absent key means unphased
- **GIVEN** a change whose sidecar has no `phase:` key (or no sidecar at all)
- **WHEN** the server loads the change
- **THEN** the change is reported with a null phase and no sidecar is created

#### Scenario: invalid or reserved value tolerated
- **GIVEN** a sidecar hand-edited to `phase: verified`
- **WHEN** the server loads the change
- **THEN** the value is treated as absent, a warning is logged, and the server does not crash

#### Scenario: sidecar write preserves other keys
- **GIVEN** a sidecar containing unrelated existing keys (e.g. `schema:`)
- **WHEN** the server writes a new phase value
- **THEN** the unrelated keys are preserved byte-for-byte in intent (same values after reparse)

### Requirement: Phase Transition API
The server SHALL expose `GET /api/changes/:id/phase` and a
CSRF-guarded `POST /api/changes/:id/phase` that validates the
requested phase against the active enum, rejects the reserved
values `validated` and `verified` with an error message pointing at
the phase-gates idea note, persists accepted transitions to the
sidecar, and broadcasts the updated state over the existing
`state-updated` WebSocket event without introducing a new event
variant.

#### Scenario: successful manual transition
- **GIVEN** a change with phase `proposed`
- **WHEN** a client POSTs `{ "phase": "coded" }` with a valid CSRF token
- **THEN** the sidecar is updated, the response succeeds, and connected clients receive a `state-updated` event carrying the new phase

#### Scenario: reserved value rejected with pointer
- **WHEN** a client POSTs `{ "phase": "validated" }`
- **THEN** the server responds 400 with a message stating the value is reserved for Phase 4 and referencing `docs/ideas/2026-07-04-phase-gates-and-putback.md`
- **AND** no sidecar write occurs

#### Scenario: CSRF required
- **WHEN** a client POSTs a phase without a valid CSRF token
- **THEN** the request is rejected by the `requireCsrfBase` guard and no sidecar write occurs

#### Scenario: unknown change
- **WHEN** a client POSTs a phase for a change id that does not exist on disk
- **THEN** the server responds 404

### Requirement: Kanban Phase Swim Lanes
The Kanban SHALL render one swim lane per active phase in pipeline
order (`proposed`, `coded`, `reviewed`, `done`) and SHALL place each
change that has a valid phase into the corresponding lane.

#### Scenario: phased changes appear in their lane
- **GIVEN** changes with phases `proposed`, `coded`, and `done`
- **WHEN** the Kanban renders
- **THEN** four lanes are shown in pipeline order and each change appears in the lane matching its phase

#### Scenario: no lanes for reserved phases
- **WHEN** the Kanban renders
- **THEN** no `validated` or `verified` lane is displayed regardless of state

#### Scenario: unknown phase string degrades safely
- **GIVEN** a change whose reported phase is a string outside the active enum
- **WHEN** the Kanban renders
- **THEN** the change is displayed in the unphased fallback section and the board does not crash

### Requirement: Manual Phase Transitions In The UI
The Kanban SHALL support manual phase transitions in any direction
via two affordances: dragging a card between phase lanes (primary)
and a per-card, keyboard-operable "Phase" menu listing all active
phases (secondary). Both SHALL invoke the phase transition API; no
phase transition SHALL occur automatically from job completion or
artifact state.

#### Scenario: drag between lanes
- **GIVEN** a card in the `proposed` lane
- **WHEN** the user drags it to the `reviewed` lane
- **THEN** the client POSTs `reviewed` to the phase API and the card renders in the `reviewed` lane

#### Scenario: menu transition
- **GIVEN** a card in any lane
- **WHEN** the user opens the card's Phase menu with the keyboard and selects `done`
- **THEN** the same phase API call is made as for a drag

#### Scenario: backward transition allowed
- **GIVEN** a card in the `reviewed` lane
- **WHEN** the user drags it back to `coded`
- **THEN** the transition succeeds; Phase 2 imposes no directional restriction

#### Scenario: no auto-advance
- **GIVEN** a change whose agent job completes and whose tasks are all ticked
- **WHEN** the server refreshes state
- **THEN** the change's phase is unchanged

### Requirement: Legacy Fallback For Unphased Changes
The Kanban SHALL render changes that have no phase in a collapsed
"Unphased" section that groups them using the pre-existing
todo / inprogress / done bucketing, and SHALL allow the user to opt a
change into the phase system by dragging its card into a phase lane.

#### Scenario: unphased change renders as before
- **GIVEN** a change directory with no `phase:` sidecar key
- **WHEN** the Kanban renders
- **THEN** the change appears in the Unphased section in the same todo/inprogress/done bucket the previous 3-column layout would have assigned

#### Scenario: opting in via drag
- **GIVEN** an unphased card in the Unphased section
- **WHEN** the user drags it into the `proposed` lane
- **THEN** the phase API is called with `proposed`, the sidecar gains a `phase:` key, and the card moves into the lane

#### Scenario: empty fallback section
- **GIVEN** every change has a phase
- **WHEN** the Kanban renders
- **THEN** the Unphased section is hidden or rendered empty-collapsed without occupying lane space
