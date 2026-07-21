## ADDED Requirements

### Requirement: Preload sandbox import guard

The build system SHALL verify that `electron/src/preload.ts` and every file it transitively imports do not reference Electron main-process modules or any bare module outside a preload-safe allowlist. The verification SHALL run before `tsc` in the electron workspace's `build` and `dev` scripts and SHALL exit non-zero on violation.

#### Scenario: Direct main-process import in preload is rejected

- **GIVEN** `electron/src/preload.ts` contains `import { app } from 'electron';` (or any other main-process-only named import like `Menu`, `shell`, `dialog`, `BrowserWindow`, `ipcMain`)
- **WHEN** `npm run build` (or `npm run dev`) is invoked in the electron workspace
- **THEN** the preload import guard exits non-zero BEFORE `tsc` runs
- **AND** the error message names `electron/src/preload.ts`, the offending specifier `app`, and the source module `electron`

#### Scenario: Transitive main-process import via local module is rejected

- **GIVEN** `electron/src/preload.ts` contains `import { X } from './menu';`
- **AND** `electron/src/menu.ts` contains `import { app, Menu, shell } from 'electron';`
- **WHEN** the guard runs
- **THEN** it walks from preload into `./menu`, detects the disallowed `electron` import there, and exits non-zero
- **AND** the error message names `electron/src/menu.ts`, the offending specifier(s) `app`/`Menu`/`shell`, AND the reach path `electron/src/preload.ts → ./menu`

#### Scenario: Preload-safe imports pass

- **GIVEN** `electron/src/preload.ts` only imports `contextBridge` and `ipcRenderer` from `electron`, plus any purely-local files that themselves only import preload-safe modules
- **WHEN** the guard runs
- **THEN** it exits 0 and prints a success line naming the number of files walked

#### Scenario: Guard runs before tsc in dev + build

- **WHEN** either `npm --workspace ithyno-electron run build` or `npm --workspace ithyno-electron run dev` is invoked
- **THEN** the sequence is: `check-preload-imports` → `sync-about-config` → `tsc` (→ `electron .` for dev)
- **AND** if the guard fails, `tsc` is never invoked and no `electron/out/*.js` is written from this run

### Requirement: Preload-safe allowlist is explicit

The guard SHALL define its allowlist as an explicit constant in the script, not as an implicit rule. Adding a new allowed import surface (e.g., a new preload-safe helper module in a different directory) SHALL be a deliberate edit to that constant.

#### Scenario: Allowlist visible at top of script

- **WHEN** a reader opens `scripts/check-preload-imports.mjs`
- **THEN** an allowlist constant is visible near the top of the file
- **AND** its comment names which `electron` symbols are considered preload-safe (`contextBridge`, `ipcRenderer`) and which pattern of relative imports are recursed into

#### Scenario: Extending the allowlist is a code change

- **GIVEN** a maintainer wants to permit a new preload-safe import surface
- **WHEN** they add it to the allowlist constant
- **THEN** the change is a normal spec-driven proposal (or trivial edit, per project convention), reviewed as any other source edit
- **AND** no runtime override, environment variable, or CLI flag can loosen the allowlist
