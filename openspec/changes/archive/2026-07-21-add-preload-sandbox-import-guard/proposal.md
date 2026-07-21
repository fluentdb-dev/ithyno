---
tags: [electron, preload, sandbox, build, lint, dispatch-safety]
execution: worktree
---

## Why

`add-terminal-reconnect` shipped a preload regression that survived
4 rounds of copilot review + Manager verify (test/typecheck/build).
The R1 sonnet worker wrote `import { IPC_TERMINAL_RESTART } from
'./menu';` in `electron/src/preload.ts` — innocent-looking, and
static-legal TypeScript. But `menu.ts` imports `app`, `Menu`, and
`shell` from the `electron` package (main-process-only APIs). With
`sandbox: true` in the BrowserWindow's `webPreferences` (which we
use), the sandboxed preload environment throws at load time on that
transitive main-process import. The preload script's body never
runs, `window.openspecUI` never gets exposed, and `.is-electron-mac`
class never lands on `<body>` — traffic lights overlap the ithyno
logo, and the window can't be dragged.

The bug was invisible to every gate we had:

- **Copilot review** reads code statically. The constraint (preload
  cannot transitively import main-process modules) is a **runtime**
  property of the Electron sandbox, invisible to static analysis
  when the imports look like ordinary TypeScript.
- **`tsc` typecheck** happily resolves the imports — they exist,
  their types are correct.
- **`npm run build`** emits `electron/out/preload.js` cleanly; no
  step actually loads it in a sandboxed BrowserWindow.
- **`npm test`** has no test that exercises the preload/renderer
  bridge in a real Electron sandbox.

Root cause: the workflow lacks a build-time guard for this class of
error. When a future dispatch spawns a worker to touch preload
(e.g., a new IPC channel), they will hit exactly the same trap.

This change closes the gap with a small pre-`tsc` script that walks
the preload import graph and rejects imports outside a preload-safe
allowlist. Rejection at build time = failure surfaces during Manager
verify's `npm run build`, and CI catches it before archive.

Captured in `docs/ideas/2026-07-21-preload-sandbox-import-guard.md`
(promoted here).

## What Changes

- **New `scripts/check-preload-imports.mjs`** — Node script that:
  1. Reads `electron/src/preload.ts`.
  2. Walks its import graph transitively (relative imports only —
     `electron/*` module imports are terminals in the walk).
  3. For each file in the graph, extracts import specifiers.
  4. Asserts each specifier matches a preload-safe allowlist:
     - `electron` — allowed only when the destructured names are a
       subset of `{ contextBridge, ipcRenderer }`.
     - Any other bare-module import (e.g., `node:path`, `node:fs`,
       `electron`'s other subpaths, third-party) — REJECTED.
     - Relative imports — allowed, but recursed into.
  5. Exits non-zero with a clear error naming the offending file +
     specifier + what allowlist entry was violated.
- **Wire the check into `electron/package.json` `build` and `dev`
  scripts**: `node ../scripts/check-preload-imports.mjs && tsc -p
  tsconfig.json` (plus the existing `sync-about-config` step).
  Runs BEFORE tsc so the failure surfaces early with a preload-
  specific error rather than an obscure tsc emit issue.
- **Documentation** — comment header on the check script pointing
  to the outcome + one line in `electron/README.md` explaining
  the guard.
- **Regression test** — a test in the check script's tests: create
  a fixture `preload.fixture.ts` that transitively imports a
  main-process module and assert the script exits non-zero with a
  useful message.

## Success

- `node scripts/check-preload-imports.mjs` on the current tree exits
  0 (no violations).
- Reverting the `add-terminal-reconnect` R1 preload state
  (re-adding `import { IPC_TERMINAL_RESTART } from './menu';`) and
  re-running the check exits non-zero, with a message that names
  `electron/src/preload.ts:2` and `./menu` → `app`/`Menu`/`shell`
  from `electron`.
- `npm run electron:dev` after the guard is wired still builds
  successfully.
- Adding a new preload import that pulls in a main-process module
  (e.g., `import { app } from 'electron'`) directly, or via a new
  sibling file, is caught at build time — Manager verify
  (`npm run build`) fails, and dispatch loops back to `code` stage
  with the check output as the finding.
- The check is fast (~50-100 ms on this repo's preload graph) so
  it does not meaningfully slow the electron dev/build cycle.
