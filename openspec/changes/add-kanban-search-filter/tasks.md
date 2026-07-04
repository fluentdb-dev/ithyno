## 1. UI: filter input

- [ ] 1.1 Add `<input type="search" placeholder="Filter changes…" />` to the Overview header, positioned above the Kanban columns
- [ ] 1.2 Local component state `filterText: string` (default `""`)
- [ ] 1.3 CSS: minimal border, monospace font, ~320px wide; matches header pill styling

## 2. Behavior: filter application

- [ ] 2.1 Filter predicate: `text` (lowercased) matches any of
  - `change.id.toLowerCase().includes(t)`
  - `change.proposal?.title?.toLowerCase().includes(t)` (if title exists)
  - Any tag: `change.proposal?.tags?.some(tag => tag.name.toLowerCase().includes(t))`
- [ ] 2.2 Apply BEFORE bucketization — filtered changes never reach `bucketize()`, so column totals reflect the filter
- [ ] 2.3 Empty filter passes everything through (no-op)

## 3. Keyboard: `Cmd+F` / `Ctrl+F` shortcut

- [ ] 3.1 Global keydown listener on the Overview page (`useEffect` on mount)
- [ ] 3.2 Detect `(e.metaKey || e.ctrlKey) && e.key === "f"`; `preventDefault()` and focus the filter input
- [ ] 3.3 If the filter input is ALREADY the active element, do NOT preempt (let the browser's find-in-page work as a secondary escape hatch)
- [ ] 3.4 `Esc` while the input is focused: clear filterText and blur

## 4. Spec delta

- [ ] 4.1 `openspec/changes/add-kanban-search-filter/specs/dashboard/spec.md`: MODIFIED requirement covering the filter input, Cmd+F focus, Esc clear

## 5. Verification

- [ ] 5.1 With 10+ changes, type "task" in the filter → only cards whose id/title/tag matches remain visible; column totals reflect the count
- [ ] 5.2 Cmd+F (or Ctrl+F on Linux/Windows) focuses the input; typing lands there
- [ ] 5.3 Filter is case-insensitive: "TASK" matches "add-task-filter"
- [ ] 5.4 Esc while focused clears and blurs
- [ ] 5.5 Reload the page → filter is empty (session-only, deliberately not persisted)
- [ ] 5.6 On non-Overview pages (Agents, ChangeDetail, Specs, Docs), Cmd+F falls back to the browser's find-in-page — no accidental focus-steal
