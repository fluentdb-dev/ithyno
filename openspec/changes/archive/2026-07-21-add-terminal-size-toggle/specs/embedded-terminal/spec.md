## ADDED Requirements

### Requirement: Terminal size toggle in the header

The terminal panel header SHALL render a size toggle to the LEFT of the "Terminal" label. The toggle SHALL expose four exclusive options: Fullscreen, Half, Default, Hidden. Selecting an option SHALL immediately apply the corresponding layout without page navigation.

#### Scenario: Toggle position

- **WHEN** the terminal panel is visible
- **THEN** a size toggle control is present in the terminal header immediately to the left of the "Terminal" label
- **AND** the currently-active option is visually indicated (e.g., `aria-pressed="true"` + a distinct style)

#### Scenario: Fullscreen makes terminal fill the content area

- **WHEN** the user selects Fullscreen
- **THEN** the page content (Kanban / Specs / etc.) collapses within the content area
- **AND** the terminal fills the content area
- **AND** the topbar remains visible and navigable

#### Scenario: Half splits content and terminal 50/50

- **WHEN** the user selects Half
- **THEN** the content area is divided so that the page content and terminal each take approximately 50%
- **AND** the split orientation matches the existing terminal-dock orientation (horizontal split if the terminal currently docks below; vertical split if it docks beside)

#### Scenario: Default returns to baseline layout

- **WHEN** the user selects Default
- **THEN** the layout matches the pre-toggle-introduction baseline
- **AND** the terminal occupies its previous fixed proportion of the content area

#### Scenario: Hidden visually hides the terminal panel but preserves the session

- **WHEN** the user selects Hidden
- **THEN** the terminal panel body is not visible (CSS `display: none`) but remains mounted in the DOM
- **AND** the `/pty` WebSocket stays open
- **AND** the "Terminal" label is not visible
- **AND** the page content occupies the full content area
- **AND** the size toggle itself remains visible as a standalone control at the terminal's dock corner — the sole re-show entry point

#### Scenario: Re-show from Hidden via the standalone toggle

- **GIVEN** the terminal size is Hidden AND the user had scrollback in the terminal before hiding
- **WHEN** the user clicks the standalone toggle to restore
- **THEN** the terminal panel body becomes visible again
- **AND** the same PTY session is shown, with the same shell and the same scrollback intact
- **AND** no `[disconnected]` line appears

### Requirement: Size does not persist across page reloads

The selected terminal size SHALL reset to `Default` on every page reload. No persistence layer (localStorage, sessionStorage, server settings, cookies) SHALL back this state.

#### Scenario: Reload resets to default

- **GIVEN** the user selected Fullscreen (or Half, or Hidden)
- **WHEN** the user reloads the page (F5 or the Reload menu item)
- **THEN** the terminal size is Default on the first paint after reload

### Requirement: All size changes preserve the PTY session

Every transition among Default, Half, Fullscreen, and Hidden SHALL preserve the PTY session — the same shell, the same scrollback, the same WebSocket. No size change SHALL restart the terminal. Only the user-invoked "Reload Terminal" affordance (from add-terminal-reconnect) closes and re-spawns the PTY.

#### Scenario: Layout transitions preserve PTY

- **GIVEN** the user typed a command producing scrollback in Default
- **WHEN** the user selects Half or Fullscreen
- **THEN** the terminal shows the same scrollback and the shell continues to run
- **AND** no `[disconnected]` line appears

#### Scenario: Hidden preserves PTY

- **GIVEN** the user typed a command producing scrollback in any visible layout
- **WHEN** the user selects Hidden AND later restores by any option
- **THEN** the terminal shows the same scrollback and the shell continues to run
- **AND** no `[disconnected]` line appears
- **AND** the PTY child process on the server stays alive throughout — no kill, no re-spawn

### Requirement: Change detail page has no "Hide Terminal" button

The change detail page SHALL NOT render a "Hide Terminal" button. Hiding the terminal is available via the size toggle's Hidden option, which is reachable from any route.

#### Scenario: Change detail page

- **WHEN** the user navigates to any change detail page
- **THEN** no button labeled "Hide Terminal" (or its localized equivalent) is rendered on that page
- **AND** the terminal-hiding affordance is available via the toggle in the terminal panel header instead
