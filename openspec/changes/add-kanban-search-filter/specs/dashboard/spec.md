## ADDED Requirements

### Requirement: Kanban Filter Input

The Overview page SHALL expose a filter input above the Kanban
columns that removes non-matching change cards from view
(case-insensitive substring match against `change.id`, proposal
title, and tag names). The input SHALL be reachable via `Cmd+F` /
`Ctrl+F` from the Overview page; `Esc` while the input is focused
clears and blurs. Filter state SHALL NOT persist across page
reloads.

#### Scenario: Filter narrows visible cards
- **GIVEN** the Overview page renders 20 change cards across three columns
- **WHEN** the user types "task" into the filter input
- **THEN** only cards whose id, title, or any tag contains "task" (case-insensitively) remain visible
- **AND** column headers reflect the reduced count

#### Scenario: Cmd+F focuses the filter
- **WHEN** the user presses `Cmd+F` (macOS) or `Ctrl+F` (other OS) while on the Overview page
- **AND** the filter input is not already focused
- **THEN** the browser's default find-in-page is preempted
- **AND** the filter input gains focus

#### Scenario: Escape clears filter
- **GIVEN** the filter input is focused with non-empty text
- **WHEN** the user presses `Esc`
- **THEN** `filterText` is cleared
- **AND** the input is blurred
- **AND** all cards return to view

#### Scenario: Non-Overview pages preserve default Cmd+F
- **WHEN** the user is on `/agents`, `/change/*`, `/specs`, `/tags`, or `/docs`
- **AND** presses `Cmd+F`
- **THEN** the browser's native find-in-page opens as usual (no shortcut hijack)

#### Scenario: Reload clears filter
- **GIVEN** an active filter with non-empty text
- **WHEN** the user reloads the page
- **THEN** the filter starts empty; all cards visible
- **AND** no localStorage entry for the filter exists
