## ADDED Requirements

### Requirement: `maxReworkRounds` config field

`agents.yaml` SHALL support an optional top-level `maxReworkRounds` integer field, mirroring `maxParallel`'s shape and validation. Its value SHALL cap the code↔review rework loop for both `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi`.

#### Scenario: Default when field absent

- **GIVEN** `agents.yaml` does not declare `maxReworkRounds`
- **WHEN** the registry loads the config
- **THEN** the resolved `maxReworkRounds` is `5`
- **AND** `publicConfig()` reports `maxReworkRounds: 5`

#### Scenario: Valid value in range

- **GIVEN** `agents.yaml` declares `maxReworkRounds: 3`
- **WHEN** the registry loads
- **THEN** the resolved value is `3`
- **AND** the next `/ithy-opsx:dispatch` invocation escalates after 3 rework rounds

#### Scenario: Value out of range is clamped

- **GIVEN** `agents.yaml` declares `maxReworkRounds: 0` (or `-1`, or a value below the minimum)
- **WHEN** the registry loads
- **THEN** the resolved value is clamped to `1` (the minimum)
- **AND** a warning is emitted at load time naming the invalid value + the clamped result

- **GIVEN** `agents.yaml` declares `maxReworkRounds: 11` (or any value above the maximum `10`)
- **WHEN** the registry loads
- **THEN** the resolved value is clamped to `10`
- **AND** a warning is emitted

#### Scenario: Non-numeric value falls back to default

- **GIVEN** `agents.yaml` declares `maxReworkRounds: "five"` (or any non-numeric)
- **WHEN** the registry loads
- **THEN** the resolved value is `5` (the default)
- **AND** a warning is emitted naming the invalid input

#### Scenario: Dispatch skill reads the resolved value

- **GIVEN** the resolved `maxReworkRounds` is `N`
- **WHEN** `/ithy-opsx:dispatch <id>` or `/ithy-opsx:dispatch-multi <ids>` runs its code↔review loop for any change
- **THEN** the loop escalates that change after `N` rework rounds
- **AND** other changes in a multi-dispatch invocation are unaffected — the cap is per-change, not per-invocation

#### Scenario: Client can read the config

- **WHEN** the client fetches `/api/agents/config` (or the equivalent endpoint exposing `publicConfig()`)
- **THEN** the response includes `maxReworkRounds` alongside `maxParallel`
