## Context

`ensureAgmsgInstalled()` was added by `bundle-agmsg-in-electron` as the
first-launch onboarding path for agmsg. At the time, Settings' own install
button didn't exist yet, so the startup dialog was the only way to install
agmsg without a manual `/plugin marketplace add fujibee/agmsg`. Settings'
Prerequisites section (with its own `PrereqInstallModal` + `POST
/api/doctor/install` flow) was added later and now fully covers that need —
the startup dialog has been redundant with it since, just without either
party being cleaned up.

## Goals

- Agmsg installation happens only when a user explicitly asks for it.
- No functionality is lost: agmsg stays installable/configurable from
  Settings, and gains a second, more discoverable trigger from New
  Project — positioned where it actually belongs in that flow (see
  "Where in New Project" below).
- One install implementation, not two. One team-config form, not two.

## Non-Goals

- Not changing how the actual copy/install mechanics work
  (`POST /api/doctor/install`'s Windows Git Bash/sqlite3 gating, vendor
  root resolution, chmod-on-copy) — only removing the automatic-launch
  trigger and adding a second explicit trigger.
- Not touching tmux's row in either dialog — tmux has no automatable
  install path (confirmed by `doctor.ts`'s existing streaming guidance:
  "No automated tmux install exists for Windows... Download a Windows
  tmux fork"), so it stays read-only everywhere.

## Decisions

### Remove `agmsg-installer.ts` outright rather than keep it unused

Once `main.ts` stops calling `ensureAgmsgInstalled()`, the file's dialog +
copy logic has no caller. Keeping it around as dead code invites drift
(e.g. someone "fixing" a bug in the now-unused copy path instead of the
live `/api/doctor/install` one). Delete it.

### Reuse `PrereqInstallModal`, don't build a new install-progress UI

Settings' `PrerequisitesSection` already has the exact button → modal →
refresh pattern needed. The onboarding screen's new Agmsg section reuses
`PrereqInstallModal` keyed to `tool="agmsg"` unmodified. On modal close
with `didInstall: true`, re-fetch the doctor report so the row's ✓/○
status updates in place.

### Where in New Project: onboarding screen, not `InitDialog`

First draft put the Install button directly in `InitDialog`'s
Prerequisites list, right next to the CLI-readiness rows that gate
whether Continue is even enabled. Revised after propose-stage feedback:
agmsg has nothing to do with that gate — a project with zero agmsg setup
is still perfectly initializable. Mixing an unrelated optional action
into the required-prerequisites step was confusing UI, not a shortcut.

Both Install and Configure now live in `OnboardingProject`'s own Agmsg
section, shown only once `isComplete` is true (the main chain — scaffold,
openspec-init, agents-yaml — has already finished). This also sidesteps
a lifecycle wrinkle: `InitDialog` unmounts once Continue is clicked (see
`OnboardingProject`'s `dialogPhase` state machine), so any doctor-report
state it held wouldn't have survived past Continue anyway.

`InitDialog` itself reverts fully to its pre-existing behavior: read-only
tmux/agmsg status rows, no buttons, no `installTool` state.

### `AgmsgConfigModal`: read the store directly, don't prop-drill

Settings' old inline form took `storeAgmsg` as a prop from its parent.
Making the extracted modal read `useStore((s) => s.agmsg)` directly
(instead of requiring callers to pass it in) means both consumers —
Settings and the onboarding screen — can render `<AgmsgConfigModal
onClose={...} />` with no other wiring.

### `AgmsgConfigModal` updates the store directly on save, not just via WS

`App.tsx` returns `<OnboardingProject />` before ever calling
`connectWs()` when the path is `/onboarding` (it's explicitly "a
full-page onboarding UI without the App shell"). That means a save made
from the onboarding screen would succeed server-side but the client's
`agmsg` store field would never learn about it — the `agents-updated`
broadcast that normally carries that update never arrives, since there's
no WebSocket to arrive on. `AgmsgConfigModal` calls
`useStore.setState({ agmsg: ... })` directly right after a successful
`POST /api/config/agmsg`, so it's correct with or without a live WS
connection. In Settings (which does have one), the subsequent broadcast
just re-confirms the same value — harmless.

### Don't add a tmux install trigger anywhere

Out of scope: tmux has no working automated install anywhere in the
codebase today (Windows: no package manager reliably ships a working
fork; the doctor's tmux install branch on win32 only streams a download
link). Adding a fake "Install" button that just repeats that guidance
would be surface area for no functional gain — keeping tmux read-only
everywhere stays consistent.

## Risks

- **Interaction with `add-windows-agmsg-support`** (in-flight, not yet
  archived) — see proposal.md's dedicated section. The two changes touch
  the same requirement; whichever archives second must reconcile against
  the other's already-landed text instead of resurrecting the dialog.
- Removing the startup dialog means a user who never visits Settings or
  New Project and never ran `/plugin marketplace add fujibee/agmsg`
  manually will simply never get agmsg — acceptable, since the same is
  already true for every other optional prerequisite (tmux, individual
  agent CLIs) and none of those get a startup nag either.
