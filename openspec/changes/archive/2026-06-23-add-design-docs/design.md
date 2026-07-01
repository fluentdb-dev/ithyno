## Context

The repo already carries `docs/architecture.md`, `docs/roadmap.md`, and the
four idea-capture files just added in `docs/ideas/`. None of them are visible
in the dashboard today. The staged-docs model (see
`docs/ideas/2026-06-23-staged-docs.md`) is the long-term direction, and this
change is the first concrete step toward making `docs/` a first-class space.

## Goals / Non-Goals

**Goals:**
- Browse every `docs/**/*.md` file from the dashboard.
- Render markdown bodies and surface YAML frontmatter (status, tags, source,
  related, promoted_to) as metadata above the body.
- Idea-stage files get a lifecycle indicator in the sidebar.
- Live updates via the existing chokidar watcher.

**Non-Goals:**
- Editing or creating docs from the UI. Docs view is read-only in v1.
- Clickable tag chips that filter the dashboard — that lands in
  `add-cross-cutting-tags`.
- typedoc integration / generated docs — `add-code-docs` will write into
  `docs/api/`, and this Docs page will render whatever shows up there. No
  generation work in this change.
- Idea lifecycle UI (status filters, promote button) — held; see the parked
  `add-idea-lifecycle` idea.

## Decisions

- **Tree + viewer split.** `GET /api/docs` returns the directory tree with
  frontmatter parsed (so the sidebar can show indicators without fetching
  each body). `GET /api/docs/file?path=...` returns one file's full
  `{ path, frontmatter, body, hash }`. Keeps payloads small and matches the
  `state` + `change` split already used elsewhere.
- **`gray-matter` on the server** for frontmatter. Standard, small,
  bundles its own YAML parser. Avoids handrolling YAML.
- **`react-markdown` + `remark-gfm` on the client** for rendering. GFM gives
  us task lists, tables, and code blocks for free, matching how our existing
  `openspec/` markdown already looks.
- **No syntax highlighting in v1.** Significant bundle cost for limited
  value. Code blocks render as plain `<pre><code>`. Revisit if and when the
  Docs page hosts code-heavy reference material.
- **Live updates via the existing watcher.** The chokidar instance currently
  watches `openspec/`. Extend it to also watch `docs/` and emit a new WS
  event `doc-updated`. Echo suppression (sha1 hash recording) is reused as-is.
- **Idea status in the sidebar.** Files under `docs/ideas/` show their
  `status` (`idea` / `exploring` / `shaped` / `promoted` / `dropped`) as a
  small colored dot beside the filename. The five values get five fixed
  colors; missing/unknown status renders a neutral dot.
- **Sidebar sort.** Directories first (collapsible), then files alphabetical
  within each level. Idea files inside `docs/ideas/` sort by descending date
  prefix so the newest idea sits at the top.
- **Known vs unknown frontmatter fields.** Known: `status`, `tags`, `source`,
  `related`, `promoted_to`. Each gets a typed badge. Unknown fields fall into
  a collapsible "more metadata" section as raw key/value pairs — so docs
  with their own schema don't break rendering.
- **Read-only.** Surgical-edit currently targets task checkboxes only;
  generalizing it to arbitrary markdown bodies is out of scope. The UI
  intentionally shows no edit affordance.

## Risks / Trade-offs

- **Watcher load.** Adding `docs/` slightly increases the watched file count.
  Negligible for this repo size; chokidar handles thousands of files easily.
- **Dependency footprint.** `react-markdown` (~50 KB gz) and `gray-matter`
  (~30 KB) are both widely used. Acceptable for the value.
- **Cross-references are standard markdown links.** Idea files reference each
  other with `[label](path.md)` instead of wiki-style `[[name]]`, which is
  universal and renders natively without a custom resolver. Structured cross
  references continue to live in the frontmatter `related:` list so the
  future tag pages can stitch them.
- **No editing.** Expected complaint. v1 stays read-only by design; editing
  arrives only when the underlying conflict UX matches what we already give
  task checkboxes (surgical, optimistic-locked).
