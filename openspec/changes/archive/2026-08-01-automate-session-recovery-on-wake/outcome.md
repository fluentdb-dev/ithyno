# Outcome: automate-session-recovery-on-wake

## ✅ What worked

- Added system wake-up and focus event listeners (`visibilitychange`, `focus`) in `web/src/App.tsx`.
- Automatically executes `checkAuth()`, `connectWs()`, and `load()` when the OS recovers from sleep or when the tab gains focus, seamlessly restoring workspace state without manual user interaction.
- If auth check fails upon wake-up in Electron (`isElectronShell()`), automatically attempts a single window reload to re-evaluate the local server session before falling back to the Session Expired banner.

## ⚠️ What surprised us

- Combining `visibilitychange` with `focus` events provides reliable cross-browser and Electron wake-up detection across sleep states.

## 🔁 What we'd do differently

- None.

## 🌱 Follow-ups

- None required.
