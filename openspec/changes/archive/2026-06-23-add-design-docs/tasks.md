## 1. Server: docs parsing
- [x] 1.1 Add `gray-matter` dependency
- [x] 1.2 Create `server/parser/docs.ts` that scans `docs/` recursively, parses frontmatter, returns a tree
- [x] 1.3 Extend types in `server/model.ts`: `DocsTree`, `DocsEntry`, `DocsFile`
- [x] 1.4 Add `GET /api/docs` returning the tree (frontmatter parsed, no body)
- [x] 1.5 Add `GET /api/docs/file?path=...` returning `{ path, frontmatter, body, hash }`

## 2. Server: live updates
- [x] 2.1 Extend the chokidar watcher to also watch the `docs/` directory
- [x] 2.2 Broadcast a `doc-updated` WS event when a `docs/**/*.md` file changes
- [x] 2.3 Reuse existing echo suppression for any future server-side docs writes

## 3. Web: types + store
- [x] 3.1 Mirror server types in `web/src/types.ts`
- [x] 3.2 Store: docs tree + currently-open file content + per-path cache
- [x] 3.3 WS handler for `doc-updated`: refresh the tree and re-fetch the open file if it changed

## 4. Web: Docs page
- [x] 4.1 Add a "Docs" link to the topbar (after Specs)
- [x] 4.2 Route `/docs` (and `/docs/*` for deep links) with sidebar + viewer layout
- [x] 4.3 Sidebar tree: directories first, files alphabetical, idea files sorted by date descending
- [x] 4.4 Sidebar status indicator on idea files (color dot keyed by status)
- [x] 4.5 Viewer: frontmatter badges (status / tags / source / related / promoted_to) then react-markdown body
- [x] 4.6 "More metadata" collapsible for unknown frontmatter fields
- [x] 4.7 Empty state: "Select a doc to view"

## 5. Style
- [x] 5.1 Sidebar tree styling (indentation, hover, selected, status dots)
- [x] 5.2 Frontmatter badge styles (one color per status value; tag chip styling)
- [x] 5.3 Markdown typography (headings, code blocks, tables, lists, blockquotes)

## 6. Verification
- [x] 6.1 Browse `docs/architecture.md` and `docs/roadmap.md` and they render
- [x] 6.2 Browse the 4 ideas in `docs/ideas/` and see their status dots in the sidebar
- [x] 6.3 Edit a docs file externally (e.g. `sed -i ''`) and the viewer updates live
- [x] 6.4 Add a new file under `docs/` and it appears in the sidebar
