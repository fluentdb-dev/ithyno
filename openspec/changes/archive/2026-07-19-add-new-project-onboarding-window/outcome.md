# Outcome — add-new-project-onboarding-window

## ✅ Worked

- **Layered design landed cleanly.** Backbone in `bin/new-project-chain.js`
  is stateless and channel-agnostic; server SSE endpoint is a thin
  wrapper; the React page consumes SSE via `fetch` + reader loop; the
  channel routing lives in a tiny `onboardingChannel.ts` module.
- **`runNewProjectChain` unit tests pass (4/4)** with real `openspec init`
  runs against tmpdirs — verifies scaffold step succeeds end-to-end
  and event shape is consistent.
- **Manual verify 7.3 PASSED end-to-end** (after the session-token
  fix noted below): File → New Project → pick fresh path →
  onboarding window opens → both steps stream progress → "Open
  Project" enables → click → main window switches to new project.
- **Electron's onboarding BrowserWindow uses `contextBridge`** for its
  IPC bridge (`ithynoOnboarding.onboardingOpen` / `onboardingClose`),
  matching Ithyno's existing preload pattern (agmsg-installer,
  main-window preload).
- **Browser mode Settings NewProjectSection shrank ~150 → ~80 lines**
  now that all the progress + result UI lives in the shared onboarding
  page. Fewer moving parts in Settings.
- **`/onboarding` renders even when no OpenSpec project is loaded** —
  short-circuited at the top of `App.tsx` so the "No OpenSpec project
  found" empty state doesn't block it. Full-page layout without the
  Ithyno topbar.
- **278 tests pass** (267 → 278 = +11 from the 4 new chain tests + 5
  existing init tests + others). Typecheck + build clean on both the
  main repo and the electron workspace.

## ⚠️ Surprises

- **`runInit` with `quiet: true` silences the per-file `create:`/`skip:`
  lines** (not just the trailing summary). To surface log lines in the
  chain we pass `quiet: false`, which also emits a "Next steps" hint
  block — harmless in the onboarding log pane, but slightly noisy.
  A `noNextSteps` option on `runInit` would tidy this up; deferred
  as a follow-up.
- **VS Code webview types** already declare
  `Window.acquireVsCodeApi() => unknown`. My channel module can't
  redeclare with a narrower `VsCodeApi` type — added a runtime `as
  VsCodeApi` cast instead.
- **Session token doesn't cross BrowserWindow boundaries.** First
  smoke-test run showed "Session expired" — the child onboarding
  BrowserWindow has its own sessionStorage and never saw the main
  window's token. Fixed by threading `?token=` from the server URL
  into the onboarding URL so `bootstrapToken` in the child window
  picks it up (commit `0629c47`). Predictable in hindsight — worth
  noting for the future VS Code webview follow-up which has the same
  cross-context isolation.

## 🔁 Differently next time

- **Include cross-window session state in the design pass.** The
  session-token fix cost one round-trip through the user's Electron
  window. A brief "what's shared and what isn't between the main and
  onboarding windows?" checklist during the propose would have
  caught it before impl.
- **Consider a small Playwright test** that renders `/onboarding`
  against a mock SSE stream. Would catch React state transitions
  without needing a full Electron test rig.

## 🌱 Follow-ups

- **Remaining manual verify** (tasks 7.4 / 7.5 / 8.4 / 8.5 / 8.6 /
  8.7): re-scaffold on existing folder, unwritable target, concurrent
  onboarding windows, mid-close behavior, browser-mode navigate on
  Open Project. Not run yet — pending future user smoke sessions.
- **`add-vscode-new-project-command`** — VS Code extension host can
  now open `/onboarding` in a webview panel and receive `onboarding-
  open` / `onboarding-close` messages exactly like Electron does.
  Backbone is in place; only the extension-side wiring remains.
- **`?token=` in URL is visible in the address bar of the onboarding
  window until `bootstrapToken` calls `history.replaceState`.** A tiny
  visibility leak — deferred as low-priority. Full fix would require
  post-load IPC injection.
- **`runInit` `noNextSteps` option** — tidies chain log output.
- **openspec init npx cache warming on first Electron launch** — the
  cold-start latency (10–30s) could be pre-warmed by a background
  `npx --version` or similar in the Electron main process at
  startup. Deferred; the log pane already keeps the user informed.
