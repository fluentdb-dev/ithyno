## ADDED Requirements

### Requirement: Selectable Theme (Light / Dark / System)

The dashboard SHALL support a user-selectable theme with three
values: `system` (follow OS preference via
`prefers-color-scheme`), `light`, and `dark`. Selection SHALL
persist per browser via `localStorage["ithyno.theme"]`. The
applied theme SHALL cascade to every UI surface including the
embedded xterm.js terminal.

The theme toggle SHALL live in the Settings tab (alongside
`parallelExecution`) as a tri-state segmented control. The header
SHALL NOT surface the toggle — theme is set-once configuration,
not a frequently-flipped control.

The applied theme SHALL be represented by a `data-theme` attribute
on `<html>` (`data-theme="dark"` or `data-theme="light"`). CSS
declares palettes as `:root[data-theme="dark"] { ... }` and
`:root[data-theme="light"] { ... }`.

To prevent flash-of-unstyled-content (FOUC), an inline `<script>`
in `web/index.html` SHALL read `localStorage["ithyno.theme"]` and
resolve the applied `data-theme` value BEFORE any React code
runs.

#### Scenario: System theme follows OS preference

- **GIVEN** the theme setting is `system` (default on first load)
- **AND** the OS is in dark mode
- **THEN** the dashboard renders using the dark palette
- **WHEN** the OS switches to light mode while the dashboard is open
- **THEN** the dashboard flips to the light palette live (no reload required)

#### Scenario: Manual override persists

- **WHEN** the user selects `Light` in the Settings theme toggle
- **THEN** the palette flips to light regardless of OS preference
- **AND** the choice is persisted; next reload starts in light without asking the OS

#### Scenario: Pre-render FOUC guard

- **GIVEN** `localStorage["ithyno.theme"]` is set to `"light"`
- **WHEN** the browser loads `index.html`
- **THEN** `document.documentElement.dataset.theme` is `"light"` BEFORE the React bundle mounts
- **AND** the initial paint uses the light palette (no dark flash)

#### Scenario: Embedded terminal palette matches theme

- **WHEN** the applied theme flips
- **THEN** the xterm.js `theme` option is updated using CSS variable values
- **AND** the terminal's background / foreground / cursor colors align with the surrounding UI
- **AND** the terminal is NOT disposed and recreated (scrollback is preserved)

#### Scenario: Agent output SGR colors remain readable

- **GIVEN** the Agents page renders a job transcript with SGR-colored spans (from the runner's ansi-to-html)
- **WHEN** the theme flips
- **THEN** the SGR-driven span colors are unchanged (they encode semantic meaning from the CLI, not UI decoration)
- **AND** the surrounding `<pre>` background flips per palette; contrast against the fixed SGR colors remains readable
