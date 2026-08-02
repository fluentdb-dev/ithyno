## 1. Remove the automatic startup dialog

- [x] 1.1 `electron/src/main.ts`: remove `await ensureAgmsgInstalled();` from the `app.whenReady()` chain and its import
- [x] 1.2 Delete `electron/src/agmsg-installer.ts` (dead code once nothing calls it)
- [x] 1.3 Delete `electron/src/resolve-git-bash.ts` too — orphaned once its only caller (`agmsg-installer.ts`) is gone; `server/util/resolve-git-bash.ts` is unaffected
- [x] 1.4 Search the repo for any other references to `ensureAgmsgInstalled`/`agmsg-installer` (tests, docs) and remove/update them (updated stale comments in `electron/src/main.ts` and `server/index.ts`; `vscode-extension/host/` is a gitignored build artifact, not touched; no test files referenced it)

## 2. Extract the shared `AgmsgConfigModal`

- [x] 2.1 `web/src/components/AgmsgConfigModal.tsx` (new): Enable/Team/Storage/Save form, extracted from Settings' formerly-inline `AgmsgSection`. Reads `agmsg` from `useStore` directly (no prop drilling)
- [x] 2.2 On successful save, call `useStore.setState({ agmsg: ... })` directly (not just via WS broadcast) — required for correctness on the onboarding page, which never opens a WebSocket (see design.md)
- [x] 2.3 `web/src/pages/Settings.tsx`: replace inline `AgmsgSection` with `AgmsgSummarySection` (status line + "Configure" button opening `AgmsgConfigModal`); remove the now-dead local `AgmsgConfig` type in favor of the shared one from `../types`

## 3. Add the New Project onboarding screen's Agmsg section

- [x] 3.1 `web/src/pages/OnboardingProject.tsx`: fetch the doctor report once `isComplete` is true
- [x] 3.2 Render an "Agmsg" section (only when `canOpen`/`isComplete`) with an Install button (`PrereqInstallModal`, `tool="agmsg"`, shown only when not installed) and a "Configure" button (`AgmsgConfigModal`, always available)
- [x] 3.3 On install success, re-fetch the doctor report so the row flips to ✓ in place

## 4. Revert `InitDialog` to read-only prerequisites

- [x] 4.1 `web/src/components/InitDialog.tsx`: remove the `installTool` state, `PrereqInstallModal` usage, and the agmsg Install button added in an earlier draft — both tmux and agmsg rows go back to pure status display (✓/○, no buttons), consistent with tmux's existing treatment
- [x] 4.2 Update the row's muted note to point at the onboarding screen ("optional — set up after Continue") instead of the removed "installed by Manager after Init" wording

## 5. Spec + tests

- [x] 5.1 `openspec validate limit-agmsg-install-prompt-triggers` VALID
- [x] 5.2 `web/src/components/InitDialog.test.ts`: remove the install-button logic test added in an earlier draft (that logic no longer exists in `InitDialog`)
- [x] 5.3 Add the PENDING REMOVED annotation to `openspec/specs/dashboard/spec.md` under "Electron First-Launch Auto-Installs Agmsg" per CLAUDE.md's in-flight spec 注記 rule; update it to reference both new requirement names after the design revision

## 6. Verify

- [x] 6.1 `npm test && npm run typecheck && npm run build` clean
- [x] 6.2 Manual: fresh Electron launch with agmsg uninstalled shows no dialog, main window opens immediately (confirmed via startup log reaching full "ithyno on http://..." + PTY auto-launch with zero dialog interaction)
- [ ] 6.3 Manual: Settings → Agmsg "Configure" opens the modal, saves, and the summary line updates (user to verify)
- [ ] 6.4 Manual: New Project onboarding screen's Agmsg section — Install flips the row to ✓ in place; Configure opens the modal and saves correctly even though the onboarding page has no WebSocket connection (user to verify)

## 7. Coordinate with `add-windows-agmsg-support` (in-flight)

- [ ] 7.1 Note in that change's outcome (once archived) that its dialog-Windows-gating tasks were superseded by this change, if this change archives first
- [ ] 7.2 If `add-windows-agmsg-support` archives first instead, rebase this change's REMOVED delta against the resulting spec text before archiving
