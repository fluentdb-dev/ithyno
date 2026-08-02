# Proposal: Automate Session Recovery on Sleep Wake-up

## Why

Currently, when a PC sleeps and wakes up (or when network connections drop), the session token validation can fail or disconnect, resulting in a static "Session expired" banner. The user has to manually notice the banner and click a button to recover.

Automating this recovery process — by listening to system wake-up events (`visibilitychange` / `focus`) and executing an automatic re-authorization and reconnection attempt — allows the app to seamlessly restore state after sleep without requiring manual user intervention.

## What Changes

- Add automatic system wake-up / focus event listeners (`visibilitychange`, `focus`) in `App.tsx` and `store.ts`.
- On wake-up, automatically run `checkAuth()`, reconnect WebSockets (`connectWs()`), and reload workspace state (`load()`).
- If running in Electron (`isElectronShell()`) and auth validation fails on wake-up, automatically attempt a single window reload after a 1-second grace period.
- Automatically retry auth verification up to 3 times before surfacing the fallback `Session Expired` banner.

## Capabilities

- Modified: `dashboard`

## Impact

- `web/src/App.tsx`, `web/src/store.ts`
