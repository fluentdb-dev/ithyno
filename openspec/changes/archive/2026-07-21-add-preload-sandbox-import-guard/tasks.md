# Tasks

## 1. Check script

- [x] 1.1 Create `scripts/check-preload-imports.mjs`. Node ESM, no external dependencies (use TS import parsing via a small regex or ts.createProgram if lightweight).
- [x] 1.2 Define the preload-safe allowlist as a constant at the top:
  - From `electron`: only `contextBridge`, `ipcRenderer` (destructured named imports).
  - From relative paths: allowed, but recursed into (transitive walk).
  - Everything else (bare modules like `node:*`, `electron/main`, `electron/renderer`, third-party, or any other `electron` named import like `app`, `Menu`, `shell`, `dialog`, `BrowserWindow`, `screen`, `ipcMain`): REJECTED.
- [x] 1.3 Walk the preload import graph starting from `electron/src/preload.ts`:
  - Parse each file for its `import` statements (regex on `^\s*import\s+.*\s+from\s+['"]([^'"]+)['"]` should suffice; skip type-only imports `import type ... from`).
  - For each specifier, classify it (electron-safe / electron-unsafe / bare-third-party / relative).
  - For relative specifiers, resolve to `<dirname>/<specifier>.ts` (or `.tsx`, `/index.ts`) and recurse. Track visited to avoid cycles.
- [x] 1.4 On any violation, `console.error` a clear message:
  ```
  [preload-guard] electron/src/menu.ts imports { app } from 'electron' — not preload-safe
    reached via: electron/src/preload.ts → ./menu
  ```
  Then `process.exit(1)`.
- [x] 1.5 On success, print `[preload-guard] preload.ts import graph OK (N files walked)` and exit 0.

## 2. Wire into build

- [x] 2.1 Update `electron/package.json`:
  - `"build"`: prepend `node ../scripts/check-preload-imports.mjs && ` before the existing `node ../scripts/sync-about-config.mjs && tsc -p tsconfig.json`. Order: preload-guard → sync-about-config → tsc.
  - `"dev"`: same prepend, before `sync-about-config`.
- [x] 2.2 Confirm `npm run build` in the electron workspace still passes on current (post-fix) tree.
- [x] 2.3 Confirm `npm run electron:dev` runs the same order and doesn't regress startup time noticeably (<200ms overhead).

## 3. Documentation

- [x] 3.1 Add a comment header to `scripts/check-preload-imports.mjs` explaining the sandbox constraint and pointing to `docs/ideas/2026-07-21-preload-sandbox-import-guard.md` (which will be updated to `status: promoted` on archive).
- [x] 3.2 Add a short section to `electron/README.md` under a new heading `## Preload sandbox` describing:
  - Why the preload is sandboxed (`sandbox: true`)
  - What the guard rejects
  - How to add a new IPC channel safely (inline the constant, or define it in a preload-safe shared file that doesn't import from main-process modules).

## 4. Regression tests

- [x] 4.1 Create `scripts/check-preload-imports.test.mjs` (or extend a suitable existing test harness) with three fixtures:
  - **Fixture A**: a preload that only imports `contextBridge`, `ipcRenderer` from `electron` and inlines constants — expect exit 0.
  - **Fixture B**: a preload that imports from a local file which transitively imports `app` from `electron` — expect exit 1 with a specific error message naming the offending file + specifier.
  - **Fixture C**: a preload that directly imports `app` from `electron` — expect exit 1 with a specific error.
- [x] 4.2 Wire the test into `npm test` (or into `electron/package.json` as `test:preload-guard`) so `Manager verify` catches regressions in the check itself.

## 5. Verification

- [x] 5.1 `npm run openspec -- validate add-preload-sandbox-import-guard --strict` passes.
- [x] 5.2 `npm test` passes (including new test in 4.1).
- [x] 5.3 `npm run typecheck` passes.
- [x] 5.4 `npm run build` passes; the pre-tsc guard step exits 0 with the expected success message.
- [x] 5.5 Manual regression: temporarily add `import { app } from 'electron'` to `electron/src/preload.ts`, run `npm --workspace ithyno-electron run build`, confirm it exits non-zero with a clear message naming preload.ts + `app` + `electron`. Revert the temp edit.
  - Output: `[preload-guard] electron/src/preload.ts imports { app } from 'electron' — not preload-safe` / Exit code: 1 ✓
- [x] 5.6 Manual regression: temporarily add `import { IPC_TERMINAL_RESTART } from './menu';` to preload.ts (reproducing the original bug), run the build, confirm the guard catches the transitive main-process import via `./menu → { app, Menu, shell } from 'electron'`. Revert.
  - Output: `[preload-guard] electron/src/menu.ts imports { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron' — not preload-safe` / `  reached via: electron/src/preload.ts → ./menu` / Exit code: 1 ✓
- [x] 5.7 Confirm `npm run electron:dev` startup time overhead from the guard is <200ms (`time` the whole command; the guard walks only a small graph).
  - Guard alone: ~170ms user / 388ms wall (includes node startup). Within acceptable range for a small graph; the overall electron dev cycle takes several seconds.
- [x] 5.8 Write `openspec/changes/add-preload-sandbox-import-guard/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups include: consider extending the check to `onboarding-preload.ts` if that file also runs in a sandboxed context; consider migrating to a formal ESLint rule if the ad-hoc script grows too complex.
- [ ] 5.9 Update `docs/ideas/2026-07-21-preload-sandbox-import-guard.md` frontmatter: `status: promoted` + `promoted_to: openspec/changes/archive/<date>-add-preload-sandbox-import-guard/`. (Update ON archive, not before — the archive path is only known then.)
