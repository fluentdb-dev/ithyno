# Tasks

## 1. Store + types

- [x] 1.1 In `web/src/store.ts`, add `terminalSize: "fullscreen" | "half" | "default" | "hidden"` (initial `"default"`), and a `setTerminalSize(size)` action. No persistence layer — the state resets on page reload.
- [x] 1.2 Add the size type to `web/src/types.ts` if types are centralized there; otherwise inline in the store file.

## 2. Toggle component

- [x] 2.1 Create `web/src/components/TerminalSizeToggle.tsx`. Render a small segmented control (or icon-button row) with 4 buttons:
  - Fullscreen — icon: expand / maximize
  - Half — icon: split-horizontal (or matching orientation)
  - Default — icon: minimize / restore
  - Hidden — icon: eye-off / x
  
  Wire each button's `onClick` to `setTerminalSize(size)`. Highlight the currently-active option via aria-pressed + a `data-state="active"` attribute for CSS styling.
- [x] 2.2 Style `.terminal-size-toggle` in `web/src/styles.css` — small, sits inline in the terminal header, matches existing theme-toggle button pattern (14×14 icons, rounded border, hover accent).

## 3. Terminal header wiring

- [x] 3.1 In `Terminal.tsx` (or the parent that renders the terminal panel header), position the `<TerminalSizeToggle />` immediately to the LEFT of the existing "Terminal" label. Layout via flex: `<TerminalSizeToggle /> <span>Terminal</span> ... <ReconnectButton />`.

## 4. Layout wiring

- [x] 4.1 In `web/src/App.tsx`, read `terminalSize` from the store. Compute the corresponding layout class and add it to `<div className="app ...">`.
  - `terminalSize === "fullscreen"` → add `terminal-fullscreen`
  - `"half"` → add `terminal-half`
  - `"default"` → no additional class (baseline)
  - `"hidden"` → do NOT mount `<Terminal />` (React conditional; also skip the size toggle since the terminal header is gone — see Open Question below).
- [x] 4.2 Add CSS rules for `.app.terminal-fullscreen`, `.app.terminal-half` in `web/src/styles.css`:
  - `.terminal-fullscreen` — `main.content` height/flex collapses to 0 (or `display: none`); terminal fills content area.
  - `.terminal-half` — content and terminal each get 50% of content area (respecting the existing dock orientation — inspect current CSS to match).

## 5. Re-show affordance when Hidden

- [x] 5.1 When `terminalSize === "hidden"`, do NOT unmount the size-toggle component. Instead, keep only the toggle icon visible at its dock position (bottom-right of the content area, or wherever the terminal panel currently docks). The "Terminal" label and panel body are gone; only the toggle remains as the always-visible re-show entry point.
- [x] 5.2 Style the standalone toggle (when Hidden) so it's discoverable but unobtrusive — e.g., a small circular icon-only button that floats at the terminal's would-be corner, or docks flush to the edge of the content area. Match the existing icon-button pattern (14×14 icons, `theme-toggle` style).
- [x] 5.3 Clicking any non-Hidden option from the standalone toggle re-mounts the terminal panel body (which re-spawns the PTY per Hidden's teardown contract in Requirement 3).

## 6. Remove "Hide Terminal" from change page

- [x] 6.1 Locate the "Hide Terminal" button in `web/src/pages/ChangeDetail.tsx` (or wherever it renders). Delete the button JSX and any handler that was only for it.
- [x] 6.2 Confirm no other page renders a similar Hide Terminal affordance (grep for `Hide Terminal` / `hideTerminal` / `setTerminalVisible`). If the store has a `terminalVisible` field that was only used by that button, either remove it (in favor of `terminalSize`) OR refactor its callers to use the new `terminalSize` field.
- [x] 6.3 Ensure the removal doesn't break any test (`Kanban.test.ts`, `Overview.test.ts`, etc.). Update assertions that expected the button to exist.

## 7. Regression tests

- [x] 7.1 Extend `web/src/components/Terminal.test.ts` (or add a new file `TerminalSizeToggle.test.ts`):
  - Render the toggle with initial `terminalSize === "default"`. Assert Default option has `aria-pressed="true"`, others have `false`.
  - Click Fullscreen. Assert the store updates and Fullscreen becomes `aria-pressed="true"`.
  - Click Hidden. Assert the store updates. In an integrated test, assert the terminal panel body unmounts.
  - Click Default. Assert everything returns to baseline.
- [x] 7.2 Extend or add tests for the ChangeDetail page confirming the "Hide Terminal" button is NOT present.

## 8. Verification

- [x] 8.1 `npm run openspec -- validate add-terminal-size-toggle --strict` passes.
- [x] 8.2 `npm test` passes (including new tests in 7).
- [x] 8.3 `npm run typecheck` passes.
- [x] 8.4 `npm run build` passes.
- [ ] 8.5 Manual: `npm run dev` → open dashboard → terminal panel header shows the size toggle to the left of "Terminal" label.
- [ ] 8.6 Manual: click each of the 4 options — layout responds correctly (fullscreen collapses page content, half splits 50/50, default returns to baseline, hidden unmounts the panel). Topbar stays visible in all cases.
- [ ] 8.7 Manual regression: navigate to a change detail page — no "Hide Terminal" button anywhere on that page.
- [ ] 8.8 Manual: reload the page — terminal returns to Default size (no persistence).
- [ ] 8.9 Manual: transitioning `default → half → fullscreen → default` does NOT restart the terminal (PTY connection persists, scrollback preserved). Transitioning `... → hidden → ...` unmounts + remounts the terminal (fresh PTY on remount — this is expected because Hidden fully unmounts).
- [x] 8.10 Write `openspec/changes/add-terminal-size-toggle/outcome.md` (✅ Worked / ⚠️ Surprises / 🔁 Differently / 🌱 Follow-ups). Follow-ups: per-project persistence of the last selected size (opt-in Settings); a keyboard shortcut for each option; consider a "resize dragger" as an alternative to fixed 50/50 for Half.
