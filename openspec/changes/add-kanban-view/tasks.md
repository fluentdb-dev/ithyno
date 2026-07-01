## 1. Server: hasOutcome flag for active changes
- [x] 1.1 Extend `Change` in server/model.ts with `hasOutcome: boolean`
- [x] 1.2 Detect `outcome.md` next to proposal.md when parsing active changes
- [x] 1.3 Mirror the field in web/src/types.ts

## 2. Web: dependency + column derivation
- [x] 2.1 Add `@dnd-kit/core` dependency
- [x] 2.2 Helper to map `state.changes + state.archive` to {todo, inProgress, ready, archived}
- [x] 2.3 Memoize the mapping in the Overview render

## 3. Web: Kanban board components
- [x] 3.1 Create `web/src/components/Kanban.tsx` exporting `KanbanBoard`, `KanbanColumn`, `KanbanCard`
- [x] 3.2 KanbanCard reserves a slot for the assignee badge (empty in v1)
- [x] 3.3 DONE card carries an inline Archive action (replacing the per-column archived sub-section)
- [x] 3.4 Card click navigates to `/change/:id` as today

## 4. Web: drag handlers → command modal
- [x] 4.1 Wire `@dnd-kit/core` DndContext at the board level
- [x] 4.2 TODO → IN-PROGRESS opens CommandModal with `/opsx:apply <id>`
- [x] 4.3 DONE card Archive button opens CommandModal with `/opsx:archive <id>` and the outcome warning when missing
- [x] 4.4 Invalid drops show a blocked state and reject

## 4b. Web: Archive page
- [x] 4b.1 New `/archive` route with `pages/Archive.tsx` listing archived entries (date-desc)
- [x] 4b.2 Add "Archive" link to the top navigation (between Specs and Tags)

## 5. Web: command-style awareness
- [x] 5.1 Drag handler reads `commandStyle` from the store
- [x] 5.2 CLI mode produces `npx openspec archive <id>` for the archive drag
- [x] 5.3 CLI mode disables the Apply drag with the existing tooltip

## 6. Overview integration
- [x] 6.1 Replace the card grid + Archive accordion in `pages/Overview.tsx` with `KanbanBoard`
- [x] 6.2 Move "+ New Change" button into the TODO column header
- [x] 6.3 Keep the summary line (active count + total progress) above the board

## 7. Style
- [x] 7.1 Column layout (3 columns, responsive collapse on narrow screens)
- [x] 7.2 Card styles (intent, tags, progress bar, assignee slot)
- [x] 7.3 Drag visual states (dragging, valid-drop, blocked-drop)
- [x] 7.4 DONE column sub-headers ("Ready", "Archived")

## 8. Overview layout switcher
- [x] 8.1 Add `overviewLayout: 'board' | 'cards'` to store, persisted to localStorage
- [x] 8.2 Toggle UI in the Overview header (Board / Cards segmented control)
- [x] 8.3 Conditionally render KanbanBoard or the card grid based on the choice

## 9. Verification
- [x] 9.1 Active changes populate the right columns based on progress
- [ ] 9.2 Drag TODO → IN-PROGRESS opens the Apply modal with the right command
- [ ] 9.3 DONE card Archive button warns when outcome.md is missing
- [ ] 9.4 /archive page lists archived changes in date-desc order
- [ ] 9.5 CLI mode disables the Apply drag with the same tooltip as the Apply button
- [ ] 9.6 "+ New Change" still creates a change and it appears in TODO
- [ ] 9.7 Switching layout to Cards renders the previous card grid; survives reload
