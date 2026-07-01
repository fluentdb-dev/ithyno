## 1. Server: diff extractor
- [x] 1.1 Create `server/agents/diff.ts` shelling out to `git diff --unified=3 --no-color --find-renames` against the job's branch
- [x] 1.2 Compute the merge-base once per request via `git merge-base`
- [x] 1.3 Hand-rolled parser converting the unified output into the structured shape (files, kind, hunks, lines, stats)
- [x] 1.4 Detect binary files and emit placeholders with `isBinary: true`
- [x] 1.5 Detect renames (`--find-renames`) and mark `kind: "renamed"`
- [x] 1.6 Per-file line cap (default 5000) with `truncated: true` flag

## 2. Server: caching
- [x] 2.1 Per-job lazy cache in the runner registry
- [x] 2.2 Invalidate the cache on any state transition for that job

## 3. Server: endpoint
- [x] 3.1 `GET /api/agents/jobs/:id/diff` returns the structured payload
- [x] 3.2 404 for unknown job; 200 + empty `files` for committed-nothing jobs
- [x] 3.3 Reuse the existing `isLocal` + CSRF guard

## 4. Web: types + api
- [x] 4.1 Mirror `DiffPayload` / `DiffFile` / `DiffHunk` / `DiffLine` in `web/src/types.ts`
- [x] 4.2 Add `fetchAgentJobDiff(id)` in `web/src/api.ts`

## 5. Web: DiffView component
- [x] 5.1 Create `web/src/components/DiffView.tsx` with file tree on the left, selected file on the right
- [x] 5.2 `FileTree` shows path + stats badge (`+/-`) per file
- [x] 5.3 `FileDiff` shows header + hunks
- [x] 5.4 `HunkLines` shows context / add / del rows with line-number gutter
- [x] 5.5 Truncated footer when the server flag is set
- [x] 5.6 Binary placeholder rendering

## 6. Web: integration
- [x] 6.1 `/agents` job detail gains a tab strip ("Output" / "Diff") defaulting per job status
- [x] 6.2 Kanban card: add "View diff" action when the latest job is finished; show compact stats
- [x] 6.3 Clicking "View diff" routes to the job detail with the Diff tab pre-selected

## 7. Style
- [x] 7.1 Diff colors that work in the dark theme (context muted, add green, del red)
- [x] 7.2 Line-number gutter (monospace, right-aligned)
- [x] 7.3 File-tree styling consistent with the docs sidebar

## 8. Tests
- [x] 8.1 Unit tests for the unified-diff parser (added / modified / deleted / renamed / binary / truncated / empty)
- [x] 8.2 Unit test for the line-cap truncation

## 9. Verification
- [ ] 9.1 Run an agent on a small change → diff appears on the job detail
- [ ] 9.2 Multi-file diff renders the file tree
- [ ] 9.3 Truncated file shows the footer
- [ ] 9.4 Binary file shows the placeholder
- [ ] 9.5 Kanban card with a finished job shows the compact stats and "View diff"
