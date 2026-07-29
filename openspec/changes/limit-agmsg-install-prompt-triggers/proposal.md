---
tags: [feature/agmsg, area/electron, area/onboarding]
---

# Limit agmsg install prompt to explicit triggers

## Why

Today, `ensureAgmsgInstalled()` (`electron/src/agmsg-installer.ts`) runs on
**every** Electron launch and shows a native "Install agmsg?" modal dialog
whenever agmsg isn't installed and the user hasn't clicked "Never ask" on a
prior launch. "Skip" is a one-launch dismissal — the dialog reappears next
time, indefinitely, until the user either installs or explicitly opts out
forever.

This is an unwanted interruption on every single app start for any user who
hasn't made a final decision yet. It's also redundant: the dashboard already
has a working, on-demand agmsg install flow — Settings' Prerequisites
section has an "Install" button next to the agmsg row, wired to
`PrereqInstallModal` → `POST /api/doctor/install`, with its own Windows
gating (Git Bash + sqlite3 presence) and progress streaming. That flow needs
no startup nag to exist.

Two implementations of "copy vendor/agmsg to `~/.agents/skills/agmsg`"
currently exist side by side: the Electron dialog's own copy logic in
`agmsg-installer.ts`, and the server's `POST /api/doctor/install` handler.
Removing the dialog collapses this down to one.

Separately, agmsg's *team config* (the `agents.yaml` `agmsg:` block —
enable, team name, storage path) has its own inline form buried in
Settings, with no equivalent in the New Project flow. A user setting up
a brand-new agmsg-enabled project currently has to finish New Project,
then separately go find Settings, with no guidance connecting the two.

### Revised during propose (user feedback)

An earlier draft of this proposal put an inline "Install" button
directly in `InitDialog` (the Prerequisites + Manager CLI picker shown
before Continue). Feedback during propose: agmsg has no bearing on
whether a Manager CLI can run — mixing its install action into that
gating step is the wrong place. Both install AND team config belong
**after** Continue, in the New Project onboarding screen
(`OnboardingProject`) once the scaffold/openspec-init/agents-yaml chain
completes. `InitDialog` reverts to pure read-only status for both tmux
and agmsg, exactly matching tmux's existing treatment.

Feedback also asked to unify agmsg's team-config form with Settings'
existing one rather than growing a second copy — see the new
`AgmsgConfigModal` component below.

## What Changes

### Capabilities

- **Modified**: `dashboard` — the "Electron First-Launch Auto-Installs
  Agmsg" requirement is replaced by two new requirements:
  1. **Agmsg Install Is Explicitly Triggered** — install is only ever
     triggered from Settings → Prerequisites (unchanged) or the New
     Project onboarding screen's new Agmsg section (shown after the
     main chain completes). Never automatic, never in `InitDialog`.
  2. **Agmsg Team Config Is A Shared Dialog** — the Enable/Team/Storage
     form is implemented once (`AgmsgConfigModal`) and opened from both
     Settings and the onboarding screen.

### Impl

- `electron/src/main.ts` — remove the `await ensureAgmsgInstalled();` call
  from the `app.whenReady()` startup chain.
- `electron/src/agmsg-installer.ts` — delete (dead code once nothing calls
  it; its dialog-based copy logic is superseded by the already-existing
  server-side `/api/doctor/install` handler).
- `electron/src/resolve-git-bash.ts` — delete alongside. Its only caller
  was `agmsg-installer.ts`; the server-side duplicate
  (`server/util/resolve-git-bash.ts`, used by `doctor.ts` /
  `/api/doctor/install`) is unaffected and remains the one actually
  exercised by both install triggers.
- `web/src/components/AgmsgConfigModal.tsx` (new) — the Enable/Team/
  Storage/Save form, extracted from Settings' formerly-inline
  `AgmsgSection`. Reads/writes the store's `agmsg` field directly and
  updates it from the save response (not just the WS broadcast) — the
  onboarding page never opens a WebSocket connection (see design.md),
  so relying on the broadcast alone would silently fail to reflect a
  successful save there.
- `web/src/pages/Settings.tsx` — `AgmsgSection` (the old inline form)
  replaced by `AgmsgSummarySection` (status line + "Configure" button
  opening `AgmsgConfigModal`).
- `web/src/pages/OnboardingProject.tsx` — new "Agmsg" section, shown once
  `isComplete` is true: an Install button (`PrereqInstallModal`, same
  as Settings) when not installed, plus a "Configure" button
  (`AgmsgConfigModal`) always available.
- `web/src/components/InitDialog.tsx` — reverted to the original
  read-only tmux/agmsg status rows (no buttons at all) — install/config
  actions live in the onboarding screen instead, not here.

## Interaction with `add-windows-agmsg-support` (in-flight, not yet
## archived)

That change's delta on this same requirement adds Windows-specific Git
Bash / sqlite3 gating to `ensureAgmsgInstalled()`'s dialog. Since this
change removes the dialog (and `agmsg-installer.ts`) entirely, that portion
of `add-windows-agmsg-support`'s remaining tasks (anything about the
dialog's Windows gating specifically) becomes moot — the underlying
`resolveGitBash()` / `hasSqlite3()` gating logic remains, just already
implemented on the `/api/doctor/install` server side (confirmed present:
`server/index.ts`'s `/api/doctor/install` handler already checks Git Bash
+ sqlite3 on win32 before copying). Whichever of the two changes archives
second should reconcile against the other's already-landed spec text
rather than reintroduce the dialog.

## Impact

- Removes an interruption every user currently hits on every launch until
  they make a final Install/Never-ask decision.
- No loss of capability: agmsg remains installable from Settings (already
  true today) and, newly, from the New Project flow.
- Net code reduction: one agmsg-install implementation instead of two.
