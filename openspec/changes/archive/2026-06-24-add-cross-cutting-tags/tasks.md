## 1. Server: tag collector
- [x] 1.1 Create `server/parser/tags.ts` that walks docs/ and openspec/ markdown files
- [x] 1.2 Use `gray-matter` to read `tags: [...]` from each file
- [x] 1.3 Build a TagIndex (per-namespace summaries with counts and per-type breakdown)
- [x] 1.4 Classify each artifact source (idea / doc / change / spec / archive / outcome)
- [x] 1.5 Normalize namespace splitting; bucket prefix-less tags under "other"

## 2. Server: API
- [x] 2.1 `GET /api/tags` → namespace-grouped index in fixed display order
- [x] 2.2 `GET /api/tags/:ns/:name` → artifacts grouped by type
- [x] 2.3 Return 200 + empty list for unknown tags (not 404)

## 3. Server: live updates
- [x] 3.1 Hook both existing watchers (`openspec/` + `docs/`) to mark the index stale
- [x] 3.2 Recompute the index when a watched .md file changes
- [x] 3.3 Broadcast a `tags-updated` WebSocket event when the index changes

## 4. Web: types + store + WS handler
- [x] 4.1 Mirror TagIndex / TagDetail types in `web/src/types.ts`
- [x] 4.2 Store state for the index + current tag detail with cache
- [x] 4.3 WS handler for `tags-updated`: invalidate cached views

## 5. Web: Tags pages
- [x] 5.1 Add "Tags" link to the topbar between Specs and Docs
- [x] 5.2 Route `/tags` → namespace columns with tag chips and counts
- [x] 5.3 Route `/tags/:ns/:name` → artifacts grouped by type, each linking to its detail page
- [x] 5.4 Hide namespaces with zero tags

## 6. Web: clickable tag chips on existing surfaces
- [x] 6.1 Docs viewer: tag chips become `<Link>` to /tags/<ns>/<name>
- [x] 6.2 Overview change cards: parse change proposal tags and render clickable chips
- [x] 6.3 ChangeDetail header: render tag chips when the proposal carries `tags`

## 7. Style
- [x] 7.1 Tags page layout (namespace headers, chip clusters, count badges)
- [x] 7.2 Tag chip hover and active styles
- [x] 7.3 Tag detail page: type-grouped sections

## 8. Skill update (tag discipline)
- [x] 8.1 Add a "Picking tags" section to `.claude/skills/openspec-flow/SKILL.md`: prefer existing tags, namespace strictness, kebab-case, 1–4 tags per file, multi-feature OK

## 9. Verification
- [x] 9.1 Open `/tags`: see existing idea-file tags (area/docs, feature/docs-pipeline, etc.) in the right namespaces
- [x] 9.2 Click `feature/docs-pipeline` → see the idea file listed under the "idea" type bucket
- [x] 9.3 Add a new tag to an existing file → Tags page updates live without reload
- [x] 9.4 A tag chip on a change card navigates to its tag detail page
