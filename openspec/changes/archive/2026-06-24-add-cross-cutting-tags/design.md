## Context

`add-design-docs` introduced frontmatter parsing for the `docs/` tree and
displays tag chips in the Docs viewer (non-clickable, by design). Idea files
under `docs/ideas/` already carry `tags: [feature/x, area/y]`. The vocabulary
and namespace scheme are documented in
[cross-cutting-tags](../../../docs/ideas/2026-06-23-cross-cutting-tags.md).
What is missing is the runtime that **collects tags across all artifacts** and
the navigation that lets the user jump from a tag chip to "everything else
carrying this tag."

## Goals / Non-Goals

**Goals:**
- A server-side tag collector that walks every artifact source and returns a
  per-tag index.
- A Tags page that groups tags by namespace with counts.
- A per-tag detail page that lists every artifact carrying the tag, grouped by
  artifact type.
- Tag chips on docs / changes / cards become navigation surfaces.

**Non-Goals:**
- `@tag` annotations in source code — that arrives with `add-code-docs` and
  the same tag pages will pick them up automatically once the source is added
  to the collector.
- Inferring tags from path conventions (e.g. `area/server` from
  `server/...`). Explicit declaration only in v1.
- Tag editing in the UI. Tags are declared in markdown frontmatter.
- Authoring `docs/tags/<name>.md` description pages — the Tags page works
  without them; description pages can land later.
- Per-Requirement tag syntax inside `spec.md` files. We rely on file-level
  frontmatter only in v1.

## Decisions

- **Tag source: frontmatter only.** Every `.md` file under `docs/` and
  `openspec/` is parsed with `gray-matter`; if `data.tags` is an array of
  strings, each entry becomes a tag. Files without frontmatter contribute
  nothing. Specs without frontmatter contribute nothing — they can be tagged
  later by adding a YAML block at the top.
- **Tag identity.** A tag is its full `<namespace>/<name>` string (e.g.
  `feature/embedded-terminal`). Empty namespace (a tag without a `/`) is
  bucketed under the synthetic namespace `other`. Normalization is
  case-sensitive — discipline rather than smartness.
- **Index shape.**
  ```ts
  type TagIndex = {
    byNamespace: { [ns: string]: TagSummary[] };
    namespaceOrder: string[]; // ["feature","screen","area","role","stage","other"]
  };
  type TagSummary = { tag: string; count: number; byType: Record<ArtifactType, number> };
  ```
  Per-tag detail (`/api/tags/:ns/:name`) returns the actual artifact entries:
  ```ts
  type TagDetail = {
    tag: string;
    artifacts: Array<{
      type: "idea" | "doc" | "change" | "spec" | "outcome" | "archive";
      path: string;
      title?: string;
      // links the UI can resolve into router paths
      hrefIn?: string;
    }>;
  };
  ```
- **Artifact types tracked in v1:**
  - `idea` — files under `docs/ideas/`
  - `doc` — other files under `docs/`
  - `change` — `openspec/changes/<id>/proposal.md` (and design.md, but the
    proposal is the canonical entry point)
  - `spec` — `openspec/specs/<cap>/spec.md`
  - `archive` — `openspec/changes/archive/<date>-<id>/proposal.md`
  - `outcome` — `outcome.md` files (becomes useful once `add-archive-outcome`
    lands; collector handles them already)
- **Navigation.** `/tags` and `/tags/:ns/:name` (two-segment splat is fine).
  Tag chips on cards/headers become `<Link>` to `/tags/<ns>/<name>`.
- **Watcher.** Reuse both existing chokidar instances (`openspec/` and
  `docs/`). On any `.md` change, recompute the tag index (cheap) and emit a
  new `tags-updated` WebSocket event. Clients on `/tags` refetch.
- **Top-nav order.** Overview → Specs → **Tags** → Docs. Tags sits between
  Specs and Docs because it's the conceptual bridge: a tag page shows
  artifacts of all kinds.

## Risks / Trade-offs

- **Scan cost.** Walking every `.md` file under `docs/` and `openspec/` and
  parsing frontmatter is O(files). For this repo (~50 files) the cost is
  negligible. If a project grows to thousands of artifacts we will need
  incremental updates; v1 just recomputes.
- **Vocabulary drift.** Without a controlled list, contributors can introduce
  near-duplicates (`feature/kanban` vs `feature/kanban-view`). v1 displays
  whatever is declared; a follow-up could lint for similar tags.
- **Empty namespaces.** Some namespaces may have zero tags in a fresh repo.
  The Tags page hides empty namespaces rather than showing empty columns.
- **No deep linking from typedoc yet.** Once `add-code-docs` lands, code
  symbols with `@tag` will appear under the same tag pages. No schema change
  is needed at that time — only the collector grows a new source.
