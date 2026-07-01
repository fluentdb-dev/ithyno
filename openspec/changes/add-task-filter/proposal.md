---
tags: [feature/task-filter, screen/change-detail, area/web]
---

## Why

Long tasks.md files are hard to scan once a change is underway. Users want to
hide completed tasks and focus on what is left, without editing the file.

## What Changes

Add a "show incomplete only" filter to the change detail Tasks view. The filter
is purely client-side over the already-parsed task list; no server or file
changes are involved. The filter state is remembered per change.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `dashboard`: the Change Detail Tasks view gains an optional incomplete-only filter

## Impact

- `web/src/pages/ChangeDetail.tsx` (filter control)
- `web/src/components/TaskTree.tsx` (apply filter)
- No server changes.
