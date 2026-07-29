# Tasks

## 1. Remove the Settings UI section

- [x] 1.1 In `web/src/pages/Settings.tsx`, delete the `<DefaultManagerSection ... />` render call.
- [x] 1.2 Delete the `DefaultManagerSection` function definition and its `CLI_LABELS_SETTINGS` helper (if solely used by that section).
- [x] 1.3 Remove the now-unused imports: `defaultManager`, `setDefaultManager` from the store selector, `CLI_PRIORITY` if only used here, `Cli` type if only used here.
- [x] 1.4 Keep the store slice (`defaultManager`, `setDefaultManager`) + localStorage persistence untouched — the concept remains for InitDialog preselect and future implicit-write paths.

## 2. Verify InitDialog is unaffected

- [x] 2.1 InitDialog reads `defaultManager` from the store — still works when it is `null` (fresh state) or when it holds a legacy value from `localStorage["ithyno.defaultManager"]`.
- [x] 2.2 Confirm InitDialog's preselect logic: `defaultManager && installed.includes(defaultManager) && isManagerCandidate(defaultManager)` → still resolves correctly. No change needed.

## 3. Tests

- [x] 3.1 `web/src/pages/Settings.test.ts` — the `defaultManager Settings persistence` describe block continues to pass; its tests target the store slice, not the removed UI. No test edits required.
- [x] 3.2 If any test asserts the presence of a "Default Manager" heading in Settings render, update to assert its ABSENCE. (Skim; likely none since existing tests are store-level.)

## 4. Docs / annotations

- [x] 4.1 No CLAUDE.md changes required.
- [x] 4.2 No PENDING annotation required (no landed spec requirement to modify).

## 5. Verification

- [x] 5.1 `npm run openspec -- validate remove-default-manager-settings-ui --strict` passes.
- [x] 5.2 `npm test` passes.
- [x] 5.3 `npm run typecheck` clean.
- [x] 5.4 `npm run build` clean.
- [x] 5.5 Manual: Settings page renders without the Default Manager section; Init flow's picker still preselects sensibly.
- [x] 5.6 Write `outcome.md`.
