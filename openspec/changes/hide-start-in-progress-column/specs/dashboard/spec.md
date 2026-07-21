## ADDED Requirements

### Requirement: Column-header Start selector is TODO-only

The Kanban `Start ▼ (N)` column-header bulk selector SHALL render only in the TODO column. IN-PROGRESS and DONE columns SHALL NOT render this selector.

#### Scenario: TODO column shows the selector

- **GIVEN** the TODO column contains N cards
- **WHEN** the Kanban renders the column header
- **THEN** a `Start ▼ (N)` control is present
- **AND** N reflects the TODO card count

#### Scenario: IN-PROGRESS column has no selector

- **GIVEN** the IN-PROGRESS column contains M cards
- **WHEN** the Kanban renders the column header
- **THEN** no `Start ▼` control appears
- **AND** no `(M)` counter appears alongside where the selector used to be
- **AND** the column-title + any existing count badge distinct from the selector's counter render as before

#### Scenario: DONE column has no selector

- **GIVEN** the DONE column contains K cards
- **WHEN** the Kanban renders the column header
- **THEN** no `Start ▼` control appears
- **AND** no `(K)` counter appears alongside where the selector used to be

#### Scenario: Per-card actions are unchanged

- **WHEN** the Kanban renders any card in any column
- **THEN** every per-card action button (including `Start` where it exists today) is unchanged by this requirement
- **AND** the scope of this change is limited to the column-header `Start ▼ (N)` selector
