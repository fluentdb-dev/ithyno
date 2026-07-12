## ADDED Requirements

### Requirement: Git Remote Origin Panel
The dashboard's `GitIdentityModal` SHALL expose a section for
viewing and setting the working copy's `remote.origin.url`, and
the `GitIdentityChip` SHALL surface a hint when the origin is
unset in an initialized repo. Setting the URL SHALL use
`git remote add origin` when no origin exists, and
`git remote set-url origin` otherwise. The URL is validated
against a permissive shape check on the server; changes are
CSRF-guarded.

#### Scenario: Modal shows current origin (or "none")
- **GIVEN** the project is an initialized git repo
- **WHEN** the user opens the GitIdentityModal
- **THEN** the modal renders a "Remote origin" section below the name/email fields
- **AND** the current URL is displayed (or a muted "none" placeholder if unset)
- **AND** an input field is pre-filled with the current URL (or empty when unset)

#### Scenario: Setting origin for the first time
- **GIVEN** `git remote -v` shows no origin
- **WHEN** the user enters a valid URL and clicks Save
- **THEN** the client POSTs to `/api/git/remote` with `{ url }` and the CSRF header
- **AND** the server runs `git remote add origin <url>`
- **AND** the response is 200; the modal shows the saved URL; a success toast appears
- **AND** subsequent `git remote -v` shows `origin  <url> (fetch/push)`

#### Scenario: Changing an existing origin
- **GIVEN** `git remote -v` shows `origin  <old-url> (fetch/push)`
- **WHEN** the user enters a different valid URL and clicks Save
- **THEN** the server runs `git remote set-url origin <new-url>`
- **AND** the response is 200; the modal reflects the new URL
- **AND** subsequent `git remote -v` shows `origin  <new-url> (fetch/push)`

#### Scenario: Invalid URL rejected at the API boundary
- **GIVEN** the modal input contains an obvious non-URL (e.g. `not-a-url`)
- **WHEN** the user clicks Save
- **THEN** the server responds 400 with an error message
- **AND** the client renders an error toast
- **AND** `git remote -v` is unchanged

#### Scenario: Chip hint when origin is missing
- **GIVEN** the project is an initialized git repo AND has no origin set
- **WHEN** the topbar renders
- **THEN** the `GitIdentityChip` shows its "missing" hint style with title `"No git remote origin — click to set"`
- **AND** clicking the chip opens the modal with the remote section focused

#### Scenario: Chip is clean when origin is set
- **GIVEN** both `user.name` / `user.email` AND `remote.origin.url` are set
- **WHEN** the topbar renders
- **THEN** the chip renders in its normal state with no hint dot

#### Scenario: CSRF protection
- **WHEN** a request to `POST /api/git/remote` omits the CSRF header
- **THEN** the server responds 403
- **AND** the underlying git config is unchanged

#### Scenario: Non-git project
- **GIVEN** the project is not a git repo (`gitStatus.isRepo === false`)
- **WHEN** the topbar renders
- **THEN** the chip does NOT display a "missing origin" hint (initialization flow is a separate concern)
