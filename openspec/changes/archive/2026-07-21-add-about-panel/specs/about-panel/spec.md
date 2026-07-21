# Purpose

TBD — created by archiving change add-about-panel. Update Purpose after archive.

## ADDED Requirements

### Requirement: Shared AboutInfo payload

The system SHALL expose a single `AboutInfo` payload — derived from the root `package.json` — that all UI shells consume, so version, license, and URL fields cannot drift between surfaces.

#### Scenario: Payload shape

- **GIVEN** a server call to `getAboutInfo()` or an HTTP GET to `/api/about`
- **THEN** the response is a JSON object with the fields: `name`, `version`, `license`, `description`, `repositoryUrl`, `issuesUrl`, `sponsors`, `releasesUrl`, `licenseUrl`
- **AND** `version` matches `package.json.version` byte-for-byte
- **AND** `repositoryUrl`, `issuesUrl` are derived from `package.json.repository` and `package.json.bugs.url`
- **AND** `licenseUrl` is `"https://www.gnu.org/licenses/gpl-3.0.html"` (matching the `license: "GPL-3.0-or-later"` SPDX identifier)
- **AND** `sponsors` is an array of `{ label: string, url: string }` entries, initially containing exactly one entry `{ label: "Ko-fi", url: "https://ko-fi.com/hamnbeans" }`

#### Scenario: No drift across surfaces

- **GIVEN** the About surface is opened on the web dashboard, the Electron shell, and the VS Code extension
- **WHEN** a user reads the version string on each
- **THEN** all three surfaces show the identical version string

### Requirement: Web dashboard About button in topbar

The web dashboard SHALL render a small `?` icon button in the topbar, adjacent to the `Live` connection indicator, that opens an About modal on click. The Settings page SHALL NOT contain an About section.

#### Scenario: Button placement

- **GIVEN** the dashboard is loaded on any shell (local server, Electron, or VS Code)
- **THEN** the `.topbar-right` region contains a `?` icon button with `aria-label="About ithyno"`
- **AND** the button is rendered between the `GitIdentityChip` (when present) and the `Live`/`Offline` connection indicator
- **AND** the Settings page does NOT contain an About section

#### Scenario: Click opens the About modal

- **WHEN** the user clicks the `?` button
- **THEN** an About modal opens showing the app name, version, license, and description from `AboutInfo`
- **AND** it presents buttons for: "Open Repository", "Report an Issue", one button per entry in `sponsors` labeled `Sponsor via {entry.label}`, "Check for Updates", "View License"
- **AND** the modal closes on ESC, backdrop click, or explicit close-button click

#### Scenario: External-link button behavior

- **WHEN** the user clicks any button inside the modal (including any sponsor button)
- **THEN** the user's default browser opens the corresponding URL from `AboutInfo` in a new tab (via `window.open` with `target="_blank"`)
- **AND** the modal remains open so the user can click another button without reopening it

#### Scenario: Additional sponsor entries render without client changes

- **GIVEN** the `sponsors` array is extended server-side from one entry to two (e.g., adding a GitHub Sponsors entry)
- **WHEN** the About modal is opened
- **THEN** two sponsor buttons are rendered (one per entry), each labeled `Sponsor via {entry.label}`
- **AND** no client-side code change is required to accommodate the second entry

### Requirement: Electron About panel and Help menu items

The Electron shell SHALL wire the OS-native About panel to `AboutInfo` and add Help-menu items for sponsorship, issue reporting, and update-checking.

#### Scenario: Native About panel is populated

- **GIVEN** the Electron app has finished starting up (`app.whenReady()` resolved)
- **WHEN** the user triggers the About panel (macOS `App > About ithyno`, Windows/Linux `Help > About ithyno`)
- **THEN** the panel shows `applicationName`, `applicationVersion`, and `copyright` derived from `AboutInfo`

#### Scenario: Help menu items open external URLs

- **GIVEN** the Electron Help menu is open
- **WHEN** the user clicks any sponsor entry (one per `sponsors` array entry, either directly under Help or under a "Sponsor" submenu), "Check for Updates…", "Report an Issue", or "View License"
- **THEN** the system default browser opens the corresponding URL via `shell.openExternal`
- **AND** no in-app fetch is made to compare versions or check release status

#### Scenario: No duplicate About on macOS

- **WHEN** the app runs on macOS
- **THEN** the "About ithyno" menu item appears only under the app menu (auto-inserted by Electron) — the Help menu does NOT contain a second "About" item

### Requirement: VS Code About command

The VS Code extension SHALL expose an `ithyno.about` command that opens a webview panel displaying `AboutInfo`.

#### Scenario: Command registration

- **WHEN** the extension is activated
- **THEN** the command palette lists `ithyno: About`

#### Scenario: Webview content

- **GIVEN** the user runs `ithyno: About`
- **WHEN** the webview panel opens
- **THEN** it displays the same name, version, license, and description as the other surfaces
- **AND** it renders links for: repository, issues, one link per `sponsors` entry, releases, license
- **AND** clicking any link opens the URL via `vscode.env.openExternal`

#### Scenario: No script execution in webview

- **GIVEN** the About webview is created
- **THEN** its `WebviewOptions.enableScripts` is `false`
- **AND** the webview contains no JavaScript — only static HTML + `<a href>` links

### Requirement: No telemetry from About surfaces

The About surface on every shell SHALL NOT issue any network request on open — no GitHub API poll, no telemetry ping, no analytics event, no update-check fetch.

#### Scenario: Zero-network open

- **GIVEN** any of the three About surfaces
- **WHEN** the user opens it
- **THEN** no outbound network request is made by that surface's code as a result of the open
- **AND** the only network activity occurs when the user explicitly clicks an external-link button, which is delegated to the OS/browser and is not attributed to ithyno

### Requirement: LICENSE file at repo root and bundled in distributions

The repository SHALL contain a `LICENSE` file at its root with the full text of the GNU General Public License v3.0. Every packaged distribution (electron app and `.vsix` extension) SHALL include this file so the license text travels with the binary.

#### Scenario: LICENSE at repo root

- **WHEN** a reader opens the repository at its root
- **THEN** a `LICENSE` file exists
- **AND** its contents match the canonical GPL-3.0 text (as published at `https://www.gnu.org/licenses/gpl-3.0.txt`)

#### Scenario: LICENSE bundled in electron app

- **GIVEN** an electron distribution built by `electron-builder`
- **WHEN** the packaged app is inspected
- **THEN** `Contents/Resources/app/LICENSE` (macOS) or the equivalent resources path on Windows/Linux contains the GPL-3.0 text

#### Scenario: LICENSE bundled in vsix

- **GIVEN** a `.vsix` produced by the extension's package script
- **WHEN** the archive is inspected
- **THEN** a `LICENSE` entry exists inside the archive containing the GPL-3.0 text

### Requirement: Sponsors list is extensible

The `AboutInfo.sponsors` field SHALL be an array of `{ label, url }` entries. The initial value SHALL be exactly one entry pointing at the project's Ko-fi tip jar. All UI surfaces SHALL render one action per entry so that appending a new entry (e.g., a future GitHub Sponsors entry) requires no client-side code change.

#### Scenario: Initial sponsors list

- **WHEN** a client reads `AboutInfo`
- **THEN** `sponsors` is exactly `[{ label: "Ko-fi", url: "https://ko-fi.com/hamnbeans" }]`

#### Scenario: Sponsor action opens external URL without probing

- **WHEN** a user triggers a sponsor action for entry `E`
- **THEN** the client opens `E.url` in the OS default browser
- **AND** the client does NOT probe the URL first to verify it exists
- **AND** ithyno itself does NOT make any outbound request to `E.url`'s host — the URL is handed off to the OS

#### Scenario: Appending an entry does not require client changes

- **GIVEN** the server-side `sponsors` constant is edited to append a second entry (e.g., `{ label: "GitHub Sponsors", url: "https://github.com/sponsors/fluentdb-dev" }`)
- **WHEN** any client re-reads `AboutInfo`
- **THEN** every UI surface (web modal, Electron Help menu, VS Code webview) renders an additional action for that entry
- **AND** no source change to `AboutModal.tsx`, `electron/src/menu.ts`, or the VS Code webview HTML template is required
