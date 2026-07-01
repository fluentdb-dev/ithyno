## 1. Predicate
- [x] 1.1 Add `hasNonVerifyWork(tasks: TaskList | null): boolean` helper near the Kanban component
- [x] 1.2 Substring match on `section.title.toLowerCase().includes("verif")`
- [x] 1.3 Return true when tasks are null/empty (we cannot prove there is no work)

## 2. UI gating
- [x] 2.1 In `Kanban.tsx`, derive the predicate from `change.tasks`
- [x] 2.2 When the predicate is false: replace the Run button with `<span class="kanban-verify-only">verify only</span>`
- [x] 2.3 When true: keep the existing Run button behavior unchanged

## 3. Style
- [x] 3.1 `.kanban-verify-only`: muted color, small italic, no pointer

## 4. Verification
- [ ] 4.1 `add-csrf-protection` (verify only after tier 8): Run hidden, hint shown
- [ ] 4.2 `add-electron-shell` (0/40): Run shown
- [ ] 4.3 `add-vscode-extension` (0/32): Run shown
- [ ] 4.4 A change with both docs and verify left: Run still shown
