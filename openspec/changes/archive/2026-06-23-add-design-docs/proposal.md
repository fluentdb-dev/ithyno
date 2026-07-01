## Why

Stage ② documentation (`docs/architecture.md`, `docs/roadmap.md`) and stage ①
ideas (`docs/ideas/*.md`, just introduced by the idea-capture rule) live on
disk but are invisible in the dashboard. Browsing them today means leaving the
UI. This change adds a Docs page so the staged-docs model becomes a first-class
part of the dashboard, and lays the foundation for follow-up changes
(`add-cross-cutting-tags`, `add-archive-outcome`, `add-code-docs`) to build on
the same surface.

See the captured ideas this change promotes:
- `docs/ideas/2026-06-23-staged-docs.md`
- `docs/ideas/2026-06-23-cross-cutting-tags.md` (groundwork only here)
- `docs/ideas/2026-06-23-feedback-channels.md` (groundwork only here)

## What Changes

Add a Docs section to the dashboard at `/docs`:

- Top-nav link "Docs" alongside Overview and Specs.
- Sidebar file tree mirroring the on-disk `docs/` directory structure.
- Right pane renders the selected file's body and surfaces YAML frontmatter
  (status / tags / source / related / promoted_to) as metadata badges above
  the body.
- Files under `docs/ideas/` show their lifecycle `status` as a sidebar
  indicator at a glance.
- Live updates: edits to any `docs/**/*.md` propagate to the UI without a
  manual refresh, via the existing chokidar watcher extended to `docs/`.

Markdown rendering is client-side via `react-markdown` + `remark-gfm` (we
already use remark on the server). Frontmatter parsing is server-side via
`gray-matter`. Read-only — no editing UI in v1.

## Capabilities

### New Capabilities
- `design-docs`: renders the `docs/` tree in the dashboard, parses YAML
  frontmatter, surfaces idea-stage metadata, and updates live

### Modified Capabilities
<!-- none -->

## Impact

- New `server/parser/docs.ts` scanning `docs/**/*.md` with `gray-matter`
- New REST endpoints: `GET /api/docs` (tree), `GET /api/docs/file?path=...` (content)
- Existing chokidar watcher extended to also cover `docs/`, emitting a new
  `doc-updated` WebSocket event
- New web Docs page with sidebar tree + viewer
- New deps: `gray-matter` (server), `react-markdown` (web)
- No changes to OpenSpec parsing or existing pages
