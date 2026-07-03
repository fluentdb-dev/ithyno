## ✅ Worked

- `TaskTree` filtering was a straightforward prop-thread: derive filtered
  sections locally and keep the existing empty-section skip path.
- Per-change persistence dropped into `localStorage` cleanly using a
  `openspec-ui.taskFilter.<id>` key, mirroring the existing preference
  pattern in `store.ts` (`TERM_KEY`, `STYLE_KEY`).
- Lazy `useState` init + a `useEffect` on `id` handles both first mount
  (no flash) and navigation between change ids without unmounting.

## ⚠️ Surprises

- None. The existing `TaskList` model already carries `checked`, so no
  parser or server work was needed — the entire filter runs in the
  Tasks tab.

## 🔁 Differently

- Kept the filter UI inside the Tasks tab body rather than in the tabs
  row so it only shows up when it's actionable. The design.md hint of
  "Tasks tab header" was ambiguous; the tab-body header reads more
  naturally in the current layout.

## 🌱 Follow-ups

- If more per-change UI toggles appear (e.g. hide verification
  sections), factor `openspec-ui.taskFilter.<id>` into a generic
  per-change preferences helper alongside the global keys in `store.ts`.
- Consider a global "always start with filter on" preference if users
  report they toggle it on every change.
