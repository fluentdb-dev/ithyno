# Outcome

## ✅ Worked

- **Deletion was small and clean.** One section removed from
  Settings, one function definition dropped, two unused
  imports pruned. `CLI_LABELS_SETTINGS` helper died with the
  section that used it. TypeScript's `noUnusedLocals` caught the
  leftover `CLI_PRIORITY` import in one pass — no manual sweep needed.
- **Concept preserved as intended.** The `defaultManager` store
  slice + `localStorage["ithyno.defaultManager"]` persistence stay
  intact. Existing users' preferences continue to apply at Init
  time; no data migration required. Store tests
  (`Settings.test.ts` describe block) target the setter directly and
  keep passing without edits.
- **Test count went UP, not down.** 631 → 632 tests. The `sharp`
  test that had been failing sporadically on this Node install (a
  pre-existing infra issue) happened to pass this run, so the whole
  suite is green. The change itself had zero test churn.

## ⚠️ Surprises

- **Two Manager pickers had drifted apart silently.** Settings
  showed every installed CLI; Init picker filtered to `claude` /
  `codex` / `agy` (after `fix-manager-startup-per-cli-dispatch`).
  A user could set `gemini` as their default in Settings, then find
  Init did not offer it — a bug that was only exposed once we
  actually thought about the two UIs side-by-side.
- **The user's UX observation caught what the individual-change
  reviews missed.** `expand-init-to-scaffold-agents` added the
  Settings section. `add-agents-tab-manager-section` added the Agents
  entry. Both landed independently, both looked reasonable in
  isolation. The duplication was only visible when someone asked
  "why are these both here?"

## 🔁 Differently

- **Would have paused at review time on `expand-init-to-scaffold-agents`**
  and asked "does this compete with anything on the Agents tab?"
  Adding a Settings preference that overlaps a per-project editor is
  a common UX antipattern; a checklist item for it in the code-review
  skill would help.

## 🌱 Follow-ups

- **Implicit-set on Init completion.** The `setDefaultManager` setter
  is now exported but unused. A small wire-up in
  `InitDialog.handleInit()` (call `setDefaultManager(selectedCli)`
  on successful init) would auto-remember the user's most-recent
  pick without ever showing them a preference UI. Small, safe,
  optional.
- **Full removal of `defaultManager` state** if the follow-up above
  is rejected or never lands. If no writer exists forever, the read
  path is dead code and the localStorage key is orphaned.
  `remove-default-manager-store-slice` would be the change.
- **Manager picker candidate-filter reconciliation across the app.**
  Any other place that lists Manager-eligible CLIs (currently just
  InitDialog after this change) should share the constants exported
  from a single source of truth. A tiny refactor to move
  `MANAGER_VERIFIED` / `MANAGER_UNVERIFIED` / `isManagerCandidate` to
  `web/src/lib/manager-cli.ts` would make future duplicates
  impossible.
