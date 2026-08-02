## REMOVED Requirements

### Requirement: Electron First-Launch Auto-Installs Agmsg

**Reason**: the automatic on-every-launch install dialog was an unwanted
interruption for any user who hadn't yet clicked "Install" or "Never ask" —
it reappeared on every single app start. It's also redundant now that
Settings' Prerequisites section has its own working, on-demand install
flow (`PrereqInstallModal` → `POST /api/doctor/install`).

**Migration**: agmsg is no longer offered automatically. Users install it
via the new "Agmsg Install Is Explicitly Triggered" requirement below —
from Settings (already existed) or the New Project onboarding screen
(new). `electron/src/agmsg-installer.ts` and its call from `main.ts`'s
`app.whenReady()` chain are deleted; the dialog + copy logic it
implemented is superseded by the already-existing server-side
`/api/doctor/install` handler, which becomes the sole "copy vendor/agmsg to
`~/.agents/skills/agmsg`" implementation.

## ADDED Requirements

### Requirement: Agmsg Install Is Explicitly Triggered (Settings Or New Project Onboarding)

Agmsg SHALL NOT be installed, and no install prompt SHALL be shown,
without an explicit user action. There is no automatic install-on-launch
step of any kind — the Electron shell's `app.whenReady()` chain does not
check for or offer to install agmsg.

Agmsg installation SHALL be reachable from exactly two places, both using
the same `POST /api/doctor/install` (`tool: "agmsg"`) endpoint and its
existing Windows Git Bash + sqlite3 gating:

1. **Settings → Prerequisites** — an "Install" button next to the agmsg
   row (shown only when agmsg is not yet installed), opening
   `PrereqInstallModal` and refreshing the doctor report on close.
2. **New Project onboarding screen** (`OnboardingProject`, the page shown
   after the user clicks Continue in the Initialize Project dialog) — an
   "Agmsg" section, shown once the scaffold/openspec-init/agents-yaml
   chain completes, with the same Install button + `PrereqInstallModal`
   pattern.

This is deliberately NOT in the Initialize Project dialog (`InitDialog`,
the Prerequisites + Manager CLI picker shown before Continue) — agmsg
has no bearing on whether a Manager CLI can run, so install/configure
actions for it belong after that gate is resolved, not mixed into it.
`InitDialog`'s tmux and agmsg rows both stay read-only status displays
(unchanged from tmux's existing treatment — no automated tmux install
path exists on any platform).

#### Scenario: agmsg not installed, no prompt on launch
- **GIVEN** a fresh Electron install with no `~/.agents/skills/agmsg/`
- **WHEN** the app launches
- **THEN** no dialog appears, no copy is taken, and the main window opens immediately (no `ensureAgmsgInstalled()`-equivalent step runs)

#### Scenario: install from Settings
- **GIVEN** the user opens Settings and agmsg shows as not installed
- **WHEN** they click "Install" next to the agmsg row
- **THEN** `PrereqInstallModal` opens, streams `POST /api/doctor/install { tool: "agmsg" }` progress, and on success the Prerequisites section's agmsg row flips to ✓ without a page reload

#### Scenario: install from New Project onboarding screen
- **GIVEN** the user has clicked Continue in the Initialize Project dialog and the scaffold/openspec-init/agents-yaml chain has completed, with agmsg not installed
- **WHEN** they click "Install" in the onboarding screen's Agmsg section
- **THEN** the same `PrereqInstallModal` flow runs, and on success the section's agmsg row flips to ✓ in place — the onboarding screen does not close or navigate away

#### Scenario: InitDialog never shows an install button
- **GIVEN** the user is on the Initialize Project dialog (before clicking Continue), regardless of whether agmsg or tmux is installed
- **WHEN** the dialog renders its Prerequisites list
- **THEN** both the tmux and agmsg rows show status only (✓/○), with no Install button on either

### Requirement: Agmsg Team Config Is A Shared Dialog (Settings And New Project Onboarding)

Agmsg team configuration SHALL be implemented once, as a shared
`AgmsgConfigModal` component (the `agents.yaml` `agmsg:` block: enable,
team name, optional storage path), and used unmodified from both
Settings and the New Project onboarding screen — neither SHALL own a
separate copy of the form.

The modal SHALL read the current config from and write it to the shared
client store's `agmsg` field, and SHALL update that field directly from
a successful `POST /api/config/agmsg` response rather than relying
solely on the `agents-updated` WebSocket broadcast — the onboarding
screen (`/onboarding`) never opens a WebSocket connection, so a save
made there would otherwise never be reflected locally even though it
succeeded server-side.

1. **Settings → Agmsg section** — shows a one-line summary ("Enabled —
   team `<name>`" or "Disabled") and a "Configure" button that opens
   `AgmsgConfigModal`.
2. **New Project onboarding screen's Agmsg section** (added by the
   sibling "Agmsg Install Is Explicitly Triggered" requirement) — a
   "Configure" button opening the same `AgmsgConfigModal`, available
   regardless of the row's install status.

#### Scenario: configure from Settings
- **GIVEN** the user opens Settings and agmsg is currently disabled
- **WHEN** they click "Configure", tick Enable, enter a team name, and click Save
- **THEN** `POST /api/config/agmsg { enabled: true, team: "<name>" }` is sent, the store's `agmsg` field updates immediately from the response, and Settings' summary line updates to "Enabled — team `<name>`" without waiting for the WS broadcast

#### Scenario: configure from New Project onboarding screen
- **GIVEN** the user is on the onboarding screen after the main chain completed
- **WHEN** they click "Configure" in the Agmsg section and save a team name
- **THEN** the save succeeds via the same `POST /api/config/agmsg` call and the modal reflects the saved state — no WebSocket connection is required for this to work

#### Scenario: same modal, not a duplicate
- **GIVEN** the `AgmsgConfigModal` component
- **WHEN** it is imported by both `Settings.tsx` and `OnboardingProject.tsx`
- **THEN** there is exactly one implementation of the Enable/Team/Storage/Save form in the codebase
