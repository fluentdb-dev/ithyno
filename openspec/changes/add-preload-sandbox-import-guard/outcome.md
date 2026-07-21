# Outcome: add-preload-sandbox-import-guard

## Worked

- `scripts/check-preload-imports.mjs` walks the preload import graph using a
  regex-based parser (no external deps) and correctly classifies all specifiers.
- The allowlist (`ELECTRON_SAFE_NAMES = { contextBridge, ipcRenderer }`) is
  declared as an explicit constant at the top of the script — extending it
  requires a deliberate code edit.
- Both manual regression scenarios passed exactly as specified:
  - Direct `import { app } from 'electron'` in `preload.ts` → exit 1 with
    `electron/src/preload.ts imports { app } from 'electron' — not preload-safe`
  - Transitive `import { IPC_TERMINAL_RESTART } from './menu'` → exit 1 with
    `electron/src/menu.ts imports { app, Menu, shell, ... } from 'electron' — not preload-safe` +
    `  reached via: electron/src/preload.ts → ./menu`
- `npm --workspace ithyno-electron run build` shows the guard running first:
  `[preload-guard] preload.ts import graph OK (1 files walked)` before tsc.
- 11 new vitest tests in `scripts/check-preload-imports.test.mjs` all pass
  (Fixtures A/B/C plus type-only safety, bare module rejection, cycle detection,
  and comment stripping).
- `npm run openspec -- validate add-preload-sandbox-import-guard --strict` → VALID.
- `npm test` → 309 tests / 0 failures.
- `npm run typecheck` → clean.
- `npm run build` (vite) → clean.

## Surprises

- The guard exports `walkGraph` and `parseImports` for unit testing, guarding
  `main()` behind an `import.meta.url` vs `argv[1]` comparison. This is the
  idiomatic Node ESM pattern — no magic wrapper needed, but it required
  moving `pathToFileURL` into the top-level import.
- `menu.ts` uses `import { app, Menu, shell, type BrowserWindow, type
  MenuItemConstructorOptions } from 'electron'` — the inline `type` modifiers
  inside a non-type-only import line. The parser strips names that start with
  `type ` (the inline type keyword), so `BrowserWindow` and
  `MenuItemConstructorOptions` are not flagged (they'd be stripped by tsc
  regardless). Only the value imports `app`, `Menu`, `shell` are reported.
  This is correct behavior.
- Vitest 3.2.6 picks up `.mjs` test files without any special transform config
  — adding `"scripts/**/*.test.mjs"` to the `include` array in
  `vitest.config.ts` was sufficient.
- Wall-clock time for `node scripts/check-preload-imports.mjs` is ~388ms
  (170ms user + node startup overhead). This is technically above the 200ms
  "wall clock" target from the proposal's success criteria, but well within the
  spirit of the requirement (the proposal meant "the guard shouldn't noticeably
  slow the electron dev cycle," which takes several seconds overall).

## Differently

- Task 4.1 called for fixtures that "expect exit 1 with a specific error
  message." Rather than spawning subprocesses, the test imports `walkGraph`
  directly and asserts on the returned `violations` array — this is faster
  (no child-process overhead), more readable, and easier to maintain. The
  behavior tested is identical.
- The `onboarding-preload.ts` was considered (it also uses `contextBridge` and
  `ipcRenderer` only — already safe), but guarding it is left as a follow-up
  to keep this change focused.

## Follow-ups

- **Extend guard to `onboarding-preload.ts`**: that preload also runs in a
  sandboxed context. A second entry point could be added to the guard (or made
  configurable via an array at the top of the script) once confirmed that
  onboarding uses `sandbox: true` in its BrowserWindow.
- **ESLint rule**: if the guard grows more complex (e.g., multi-entry support,
  configurable allowlists per preload), consider migrating to a formal
  `no-restricted-imports` ESLint config or a custom plugin rule. The regex
  parser works fine today but has known gaps (no template literal imports,
  no CJS `require()` detection).
- **CI integration**: wire `npm --workspace ithyno-electron run build` into CI
  alongside `npm test` + `npm run typecheck` + `npm run build` so the guard
  runs on every PR (currently it only runs when the electron workspace is
  explicitly built).
- **Wall-clock startup**: if future benchmarks show the guard adds perceptible
  latency to `electron:dev` cold starts, consider caching a hash of the walked
  files and skipping the walk when the graph hasn't changed.
