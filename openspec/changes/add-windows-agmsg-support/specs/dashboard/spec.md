## MODIFIED Requirements

### Requirement: Electron First-Launch Auto-Installs Agmsg

The Electron shell SHALL vendor fujibee/agmsg (MIT-licensed shell
scripts) under `vendor/agmsg/` in the repository and package that
directory into `resources/app/vendor/agmsg/` via
`electron-builder`'s `extraResources`. On each launch, before the
main window is created, the shell SHALL run an `ensureAgmsgInstalled()`
step that checks for `$HOME/.agents/skills/agmsg/scripts/send.sh`.

When the file is absent AND the "never ask" marker
`$HOME/.ithyno-config/skip-agmsg-install` does NOT exist, the shell
SHALL display a modal dialog with three buttons:

- **Install** — copy the vendored tree from
  `resources/app/vendor/agmsg/` to `$HOME/.agents/skills/agmsg/`,
  preserving executable bits on `scripts/*.sh`. Log the copy result
  to stdout. Do NOT overwrite an existing target — the copy is only
  taken when the target directory is absent or empty.
- **Skip** — take no action this launch. The dialog reappears next
  launch until the user chooses Install or Never ask.
- **Never ask** — create `$HOME/.ithyno-config/skip-agmsg-install`
  (a zero-byte marker file); do NOT install. Subsequent launches
  SHALL skip the dialog and take no action.

When the file is present OR the "never ask" marker exists, the
shell SHALL take no action and proceed to `createWindowForProject`.
The dialog SHALL NOT block window creation on user hesitation for
more than the modal's own display time — after the user chooses a
button, the launch continues normally.

The CLI entry point (`bin/ithyno.js`) SHALL NOT run this step —
it is Electron-only. CLI users install agmsg manually via
`/plugin marketplace add fujibee/agmsg` in their Claude session.

The install path SHALL match the location the dispatcher skill's
presence check inspects (`~/.agents/skills/agmsg/scripts/send.sh`),
so a successful auto-install immediately makes the agmsg branch of
`Dispatch Slash Command` available without further configuration.

On Windows, agmsg's install and every subsequent invocation of its
`.sh` scripts SHALL run via a resolved Git Bash `bash.exe` — Windows
cannot execute a `.sh` file directly (no shebang-based dispatch).
Git Bash SHALL be located by deriving `bash.exe`'s path from the
`git` executable already on `PATH` (e.g. `where git` /
`git --exec-path`, then `<gitRoot>\bin\bash.exe`), never by
searching `PATH` for a bare `bash` command — Windows ships
`bash.exe` stubs under `System32` and the WindowsApps alias
directory that launch WSL (or prompt to install it) instead of
resolving to Git Bash, and a bare-name PATH search can silently pick
one of those instead.

The install additionally requires `sqlite3` on `PATH` (agmsg's own
runtime dependency — see its README). When Git Bash and/or `sqlite3`
cannot be resolved, `ensureAgmsgInstalled()` SHALL skip the install
prompt on Windows and log the specific missing dependency to
stdout, mirroring the existing "vendored tree not found" skip path —
it SHALL NOT show a dialog offering to install into a setup that
cannot run it.

#### Scenario: fresh install → prompt appears, Install copies files
- **GIVEN** a fresh Electron install with no `~/.agents/skills/agmsg/` and no `~/.ithyno-config/skip-agmsg-install`
- **WHEN** the app launches
- **THEN** a modal dialog with Install / Skip / Never ask buttons appears BEFORE the main window
- **AND** clicking Install copies `resources/app/vendor/agmsg/` to `~/.agents/skills/agmsg/`
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` exists with executable bits set after the copy

#### Scenario: already installed → no prompt
- **GIVEN** an Electron install where `~/.agents/skills/agmsg/scripts/send.sh` already exists (installed via marketplace, or by a previous first-launch)
- **WHEN** the app launches
- **THEN** no dialog appears and the main window opens as usual

#### Scenario: never ask marker → no prompt on subsequent launches
- **GIVEN** the user previously clicked "Never ask" and `~/.ithyno-config/skip-agmsg-install` was created
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` is still absent
- **WHEN** the app launches
- **THEN** no dialog appears and no copy is taken; the main window opens as usual

#### Scenario: Skip → dialog appears again next launch
- **GIVEN** the user clicked "Skip" on a launch
- **WHEN** the app launches again with agmsg still not installed
- **THEN** the dialog reappears (Skip is a one-launch dismissal, not a persistent decline)

#### Scenario: CLI entry point does NOT auto-install
- **GIVEN** the user starts ithyno via `bin/ithyno.js` (CLI, not Electron)
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` is absent
- **WHEN** the server starts up
- **THEN** no dialog is shown, no copy is taken, and the CLI stdout does NOT mention agmsg install

#### Scenario: install preserves executable bits on scripts
- **GIVEN** the user clicks Install
- **WHEN** the copy from `resources/app/vendor/agmsg/scripts/` completes
- **THEN** every `.sh` file in `~/.agents/skills/agmsg/scripts/` has its executable bit set (`chmod 755` or equivalent)

#### Scenario: Windows launch with Git Bash and sqlite3 available → same prompt flow as macOS/Linux
- **GIVEN** the Electron app running on Windows
- **AND** `git` is on `PATH` and its installation root has `bin\bash.exe` (Git for Windows)
- **AND** `sqlite3` is on `PATH`
- **AND** `~/.agents/skills/agmsg/scripts/send.sh` does not exist and no "never ask" marker exists
- **WHEN** the app launches
- **THEN** the same Install / Skip / Never ask dialog appears as on macOS/Linux
- **AND** clicking Install runs `vendor/agmsg/install.sh` via the resolved Git Bash `bash.exe`, producing the same `~/.agents/skills/agmsg/scripts/send.sh` result

#### Scenario: Windows launch with Git Bash or sqlite3 missing → install step skipped
- **GIVEN** the Electron app running on Windows
- **AND** either no `git`-derived `bash.exe` can be resolved, or `sqlite3` is not on `PATH`
- **WHEN** the app launches
- **THEN** `ensureAgmsgInstalled()` returns without displaying the dialog and logs which dependency (Git Bash, sqlite3, or both) was missing

#### Scenario: Windows bash resolution ignores WSL stub bash.exe
- **GIVEN** the Electron app running on Windows
- **AND** `C:\Windows\System32\bash.exe` (the WSL launcher stub) resolves ahead of Git's `bin\bash.exe` in a bare `PATH` search
- **WHEN** `ensureAgmsgInstalled()` resolves Git Bash
- **THEN** it derives `bash.exe`'s path from the located `git` executable's installation root, not from a bare `PATH` search for `bash`, and therefore does not invoke the WSL stub
