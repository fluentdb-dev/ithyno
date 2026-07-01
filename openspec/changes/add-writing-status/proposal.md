---
tags: [feature/writing-status, feature/markdown-sync, area/server]
---

## Why

AI agents write Markdown by streaming over several seconds. With awaitWriteFinish
the dashboard stays silent until the write settles, so users cannot tell that a
file is being edited right now and may toggle a task mid-write.

## What Changes

Emit a lightweight "editing in progress" signal when a change file starts being
written, and clear it once the content settles and is re-parsed. The UI shows a
"Writing…" badge on the affected change while the signal is active. No file
content is parsed for the in-progress signal — only the fact that a write is
happening.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `markdown-sync`: external change propagation gains an in-progress writing signal

## Impact

- `server/sync/watcher.ts` (detect the first event before awaitWriteFinish settles)
- `server/index.ts` (broadcast a `file-writing` WebSocket event)
- `web/src/store.ts` and Overview/Detail (render the badge)
