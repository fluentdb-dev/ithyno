## ADDED Requirements

### Requirement: Overview layout toggle exposes phase-lane view

The Overview page's existing 2-state layout toggle (`board` / `cards`, driven by the store field `overviewLayout`) SHALL be extended to 3 states by adding a `phase` option. Selecting `phase` renders the Kanban's change list as swim lanes ordered by workflow phase (see next requirement). The `board` state (3-column progress-derived TODO / IN-PROGRESS / DONE) remains the default. Persistence across reloads uses the existing zustand-persist mechanism that already covers the toggle — no new storage decision.

Legacy persisted values (`board` / `cards`) SHALL continue to resolve unchanged. Unknown persisted values (including any future removal of a state) SHALL fall back to `board`.

The 3-state toggle SHALL render as three peer `<button role="tab">` elements inside a single `role="tablist"` container, in the tabstop order Board → Phase → Cards. Each button carries `aria-selected` matching the current store value and a `title` / `aria-label` describing its layout. The button icons SHALL be visually distinct at 16×16.

#### Scenario: Toggle exposes three options
- **GIVEN** the Overview page is rendered
- **WHEN** the user inspects the layout toggle
- **THEN** three `<button role="tab">` elements are present with `aria-label` values `"Board layout"`, `"Phase lanes layout"`, `"Cards layout"`
- **AND** exactly one has `aria-selected="true"`, matching the current `overviewLayout` store value

#### Scenario: Default is board
- **GIVEN** a fresh install with no persisted `overviewLayout` value
- **WHEN** the Overview page mounts
- **THEN** the Board button is selected and the 3-column TODO / IN-PROGRESS / DONE view renders

#### Scenario: Persist round-trips the phase value
- **GIVEN** the user has clicked the Phase toggle
- **WHEN** the page is reloaded
- **THEN** the Phase button is still selected and the phase-lane view renders

#### Scenario: Unknown persisted value falls back to board
- **GIVEN** the persisted `overviewLayout` value is a string not in `{"board", "phase", "cards"}`
- **WHEN** the Overview page mounts
- **THEN** the Board button is selected and the 3-column view renders

### Requirement: Phase-lane view renders 4 swim lanes plus Unphased fallback

When `overviewLayout === "phase"`, the Overview page SHALL render a swim-lane layout consisting of:

1. **Four lanes in pipeline order**: `proposed → coded → reviewed → done`. Each lane header displays the phase name and a card count. An empty lane SHALL display a muted placeholder ("No changes at this phase" or equivalent) instead of collapsing.

2. **An Unphased fallback section below the four lanes**, containing changes whose `phase` field is undefined or an unknown value. The fallback SHALL reuse the same 3-column TODO / IN-PROGRESS / DONE grouping as the Board view (via the same `bucketize()` helper). When the Unphased set is empty, the fallback section SHALL NOT render.

Changes whose `phase === "needs-human"` SHALL render in their `priorPhase` lane. If `priorPhase` is also undefined, they SHALL fall through to the Unphased section.

The lane layout SHALL be **display-only**. Cards SHALL NOT be draggable between lanes. The Phase view SHALL NOT show needs-human WaitBadges, phase-transition menus, or any other phase-derived affordance beyond the lane grouping itself — internal processing is unchanged, this is purely a display format.

Individual card rendering SHALL be identical to the Board view — same Start / Apply / Archive / Merge / Discard controls, same progress bar, same tag chips. No additional visual annotations tied to phase state.

#### Scenario: Four lanes render in pipeline order
- **GIVEN** the Overview page is in phase view
- **WHEN** the layout renders
- **THEN** four lane columns appear in left-to-right order: `proposed`, `coded`, `reviewed`, `done`
- **AND** each lane header shows the phase name and card count

#### Scenario: Empty lane shows placeholder
- **GIVEN** no active change has `phase === "reviewed"`
- **WHEN** the phase view renders
- **THEN** the `reviewed` lane column still appears
- **AND** its body shows a muted placeholder message instead of being empty

#### Scenario: Unphased fallback holds changes without a phase
- **GIVEN** at least one active change has `phase === undefined`
- **WHEN** the phase view renders
- **THEN** an Unphased section appears below the four lanes
- **AND** it groups those changes by the same TODO / IN-PROGRESS / DONE buckets as the Board view

#### Scenario: needs-human cards land in priorPhase lane
- **GIVEN** a change has `phase === "needs-human"` and `priorPhase === "coded"`
- **WHEN** the phase view renders
- **THEN** the change appears in the `coded` lane
- **AND** the card body renders with NO needs-human badge or annotation

#### Scenario: needs-human without priorPhase lands in Unphased
- **GIVEN** a change has `phase === "needs-human"` and `priorPhase === undefined`
- **WHEN** the phase view renders
- **THEN** the change appears in the Unphased fallback section

#### Scenario: No drag interactions in phase view
- **GIVEN** the phase view is active
- **WHEN** the user attempts to drag a card
- **THEN** no drop targets appear
- **AND** no phase-transition API call is issued

#### Scenario: Search filter narrows lanes and fallback
- **GIVEN** the phase view is active and the search filter has text
- **WHEN** the filter matches only a subset of changes
- **THEN** each lane and the Unphased section render only the matching cards
- **AND** empty lanes still show the placeholder message
