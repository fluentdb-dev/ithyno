## Why

After a user archives a change from the dashboard, the page they were viewing
(`/change/<id>`) shows a misleading "Change not found" message. That message was
intended for typo'd URLs, not for changes the user intentionally just archived.
The result is jarring — a successful action looks like an error.

## What Changes

Detect when a Change Detail URL refers to an archived change and show a
dedicated "Archived" state instead of the generic not-found message. The screen
acknowledges the archive (date and final task progress) and links back to
Overview. Legitimate typos still get the original "not found" message.

To support the archived screen, the archive summary returned by `/api/state`
gains an `archivedAt` date parsed from the archive directory name.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `dashboard`: the Change Detail page recognizes archived ids and renders an
  "Archived" panel (date + final progress + Back to Overview) instead of the
  generic "Change not found" message
- `openspec-parsing`: the archive summary carries `archivedAt` (YYYY-MM-DD)
  parsed from each archive directory's name

## Impact

- `server/model.ts` and `web/src/types.ts`: extend `ChangeSummary` with
  `archivedAt: string | null`
- `server/parser/workspace.ts`: parse the date prefix from archive directory
  names when scanning
- `web/src/pages/ChangeDetail.tsx`: archived-detection branch and panel
- New CSS for the panel
- No new dependencies; no server protocol changes beyond the extra field
