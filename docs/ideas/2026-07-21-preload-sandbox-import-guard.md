---
title: Guard preload from transitive main-process imports (and extend verify to Electron smoke)
date: 2026-07-21
status: idea
tags: [electron, preload, sandbox, verify, dispatch, workflow]
---

## Context

While running the multi-dispatch archive of `add-terminal-reconnect`,
users hit a regression where the Electron topbar lost its 28px
padding for the macOS traffic-light inset and its
`-webkit-app-region: drag` region. Symptom: red/yellow/green
buttons visually overlapped the "ithyno" logo, and the window
could not be dragged.

Root cause: `add-terminal-reconnect`'s R1 sonnet worker wrote:

```ts
// electron/src/preload.ts (bad)
import { IPC_TERMINAL_RESTART } from './menu';
```

The intent was to share the IPC channel name with `menu.ts`.
Innocent-looking. But `menu.ts` imports from `electron` (`app`,
`Menu`, `shell`) — modules that only exist in the main process.
With `sandbox: true` in the BrowserWindow's `webPreferences`, the
sandboxed preload environment throws at load time on that
transitive main-process import. The preload script's entire body
never runs. `window.openspecUI` never gets exposed.

Downstream: React's `isElectronMac()` returns `false` (the shell
looks like a plain browser), `document.body.classList.add("is-
electron-mac")` never runs, and `.is-electron-mac .topbar` CSS
never activates.

## Why the workflow missed it

Neither review nor verify caught this across 4 rounds each. The
loose ends:

1. **Copilot review reads code statically.** The import is legal
   TypeScript. The constraint ("preload cannot transitively import
   main-process modules") is a runtime property of the sandbox,
   invisible to static analysis.
2. **Manager verify runs `npm test / typecheck / build`.** All
   three pass. `tsc` emits `electron/out/preload.js` cleanly. No
   test loads that file in a sandboxed context.
3. **No verify step actually launches Electron.** Our verify chain
   never runs `electron:dev` or the packaged app. Runtime-only
   failures like this one route straight to the user post-archive.

## Proposals

Two follow-ups worth writing formal changes for:

### `add-preload-sandbox-import-guard` (small)

- Add an ESLint rule in `electron/` that treats `electron/src/preload.ts`
  as sandbox-scoped and forbids it (or any file it imports transitively)
  from importing:
  - Modules from `./menu` (main-process specific)
  - Modules from `./main` (main-process entry)
  - `electron` sub-imports beyond the sandbox-safe surface
    (`contextBridge`, `ipcRenderer`)
- Alternative: a small custom check in `electron/`'s build script that
  walks the preload import graph via `tsc --listFiles` and asserts
  none of the resolved files import outside a preload-safe allowlist.
- Trivial to write, catches the exact class of bug we just shipped.

### `add-electron-smoke-verify` (medium)

- Extend the Manager verify chain (skill-level) to include a headless
  Electron smoke: launch the packaged (or `electron:dev`) app, wait
  for `window` to open, run a page evaluate that asserts:
  - `window.openspecUI != null` (preload actually loaded)
  - `document.body.classList.contains("is-electron-mac")` on macOS
- Exit non-zero if either fails.
- Runs only when a change touches `electron/**` or `web/src/App.tsx`
  (path filter) — otherwise verify stays fast.
- Cost: adds ~5-10s to verify for electron-touching changes. Worth
  the coverage.

Both are candidates for a spec-level proposal (behavior change to
the dispatch/verify contract). Not urgent enough to fire today —
the immediate fix is committed, the pattern is documented here,
and future dispatch runs on preload-boundary code should surface
this idea via a search.
