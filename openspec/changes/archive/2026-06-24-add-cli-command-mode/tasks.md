## 1. Store: command style preference
- [x] 1.1 Add `commandStyle: 'claude' | 'cli'` to the Zustand store
- [x] 1.2 Hydrate from `localStorage.openspec-ui.commandStyle` (default `claude`)
- [x] 1.3 `setCommandStyle(v)` persists to localStorage and updates state

## 2. CommandModal: mode selector
- [x] 2.1 Add a small segmented control (Claude / CLI) at the top of the modal
- [x] 2.2 Switching the control updates the preview line immediately
- [x] 2.3 Switching the control also updates the persisted default

## 3. New Change action (mode-aware)
- [x] 3.1 In `claude` mode: keep the description input → `/opsx:propose "<desc>"`
- [x] 3.2 In `cli` mode: present a kebab-case id input → `npx openspec new change <id>`
- [x] 3.3 Validate the kebab-case id (lower-case, digits, dashes) and disable Send for invalid

## 4. Apply / Archive actions (mode-aware)
- [x] 4.1 Archive: switch between `/opsx:archive <id>` and `npx openspec archive <id>`
- [x] 4.2 Apply: disable the button in `cli` mode with a tooltip explaining why

## 5. Button badges
- [x] 5.1 Add a small "Claude" or "CLI" badge to New Change, Apply, and Archive buttons
- [x] 5.2 Badge updates live when the mode changes

## 6. Verification
- [x] 6.1 Send `npx openspec new change <id>` from CLI mode and see the change folder appear
- [x] 6.2 Send `npx openspec archive <id>` from CLI mode and confirm the archive
- [x] 6.3 Mode preference survives a hard reload
