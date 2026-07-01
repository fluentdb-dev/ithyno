---
tags: [feature/tagging, area/web, area/server]
---

## Why

Multiple stages of the project already carry tag-like metadata in frontmatter
— idea files declare `tags: [feature/x, area/y]`, and the same vocabulary is
intended to spread to docs, change proposals, archive outcomes, and (later)
code annotations. Without a runtime that **collects tags across stages**, the
vocabulary stays mute: opening any one capability (say
`feature/embedded-terminal`) requires hand-grepping every directory to gather
its related artifacts.

This change activates the tag vocabulary by adding a server-side collector and
a Tags page that aggregates everything tagged with a given namespace/name —
specs, docs, ideas, and archive outcomes in one view. It is the runtime that
the [cross-cutting-tags](../../../docs/ideas/2026-06-23-cross-cutting-tags.md)
idea promised.

## What Changes

Add tag collection and a Tags page:

- Server walks all known artifact sources (`docs/**/*.md`, `openspec/**/*.md`
  including archive) and harvests `tags: [...]` from frontmatter.
- New endpoints: `GET /api/tags` (namespace-grouped index with counts) and
  `GET /api/tags/:ns/:name` (every artifact carrying that tag, grouped by
  type).
- New top-nav link **Tags** between Specs and Docs.
- `/tags` shows a namespace-grouped index. `/tags/:ns/:name` shows the
  artifacts (idea / doc / proposal / spec / outcome) with that tag.
- Tag chips on artifact views (already present in the Docs viewer; will be
  added to ChangeDetail and Overview cards) become **clickable** and navigate
  to the corresponding tag page.
- Namespaces shown in fixed display order: `feature`, `screen`, `area`,
  `role`, `stage`. Unrecognized namespaces fall under "other".

## Capabilities

### New Capabilities
- `tagging`: server-side collection of tags across all artifact sources, plus
  the Tags page that exposes them

### Modified Capabilities
- `dashboard`: gains a Tags top-nav entry and route, and tag chips on cards
  become clickable
- `design-docs`: tag chips in the Docs viewer (introduced as non-clickable in
  `add-design-docs`) now navigate to the corresponding tag page

## Impact

- `server/parser/tags.ts`: walk artifact sources, parse frontmatter, build a
  tag index
- `server/index.ts`: `GET /api/tags` and `GET /api/tags/:ns/:name`
- `web/src/pages/Tags.tsx`: index page and tag-detail page
- `web/src/pages/Docs.tsx`: tag chips become `<Link>` to the tag page
- `web/src/pages/Overview.tsx`: tag chips on change cards
- `web/src/pages/ChangeDetail.tsx`: tag chips in the detail header
- New navigation entry; new CSS for the Tags page layout
- Reuses `gray-matter` (already a dependency)
- No new dependencies
