## 1. Server: archive date in summary
- [x] 1.1 Extend `ChangeSummary` with `archivedAt: string | null` in server/model.ts
- [x] 1.2 Parse the `^(\d{4}-\d{2}-\d{2})-(.+)$` prefix when scanning archive directories
- [x] 1.3 Mirror the type extension in web/src/types.ts

## 2. UI: archived panel in ChangeDetail
- [x] 2.1 If id is in state.archive, render an "Archived" panel
- [x] 2.2 Show the archive date (or just "Archived" when null) and final progress
- [x] 2.3 Prominent "← Back to Overview" link
- [x] 2.4 Keep the existing "Change not found" message for ids in neither list

## 3. Style
- [x] 3.1 Add CSS for the archived panel (status badge + summary)

## 4. Verification
- [x] 4.1 Archive a change from the UI → ChangeDetail swaps to the Archived panel
- [x] 4.2 Navigate to /change/<unknown-id> → original "not found" still shows
- [x] 4.3 The archive list in Overview displays each entry's date
