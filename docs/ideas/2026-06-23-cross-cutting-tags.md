---
status: shaped
tags: [area/docs, feature/tagging]
source: conversation
related: [docs/ideas/2026-06-23-staged-docs.md]
promoted_to: null
---

# Cross-cutting tags

A shared tag vocabulary across **all stages** (idea / docs / spec / code /
archive outcome) so that a single tag — `feature/embedded-terminal`,
`screen/overview` — surfaces every related artifact in one view.

## Namespaces

| prefix | meaning | examples |
|---|---|---|
| `screen/` | UI screen | `screen/overview`, `screen/change-detail`, `screen/specs`, `screen/terminal` |
| `feature/` | feature / capability | `feature/kanban`, `feature/embedded-terminal`, `feature/cli-mode` |
| `role/` | audience | `role/agent`, `role/reviewer` |
| `area/` | system area | `area/server`, `area/web`, `area/sync`, `area/parsing`, `area/docs` |
| `stage/` | lifecycle (optional) | `stage/idea`, `stage/exploring`, `stage/shipped` |

## How tags are declared

| stage | mechanism |
|---|---|
| ① idea | frontmatter `tags: [...]` (this very file) |
| ② docs | frontmatter `tags: [...]` |
| ③ proposal/design | frontmatter `tags: [...]` |
| ③ spec.md (確定) | frontmatter or per-Requirement `[tags: ...]` |
| ④ code | comment annotation `@tag screen/overview` |
| outcome | frontmatter |

## Dashboard surfaces

- `/tags` — index of all tags grouped by namespace, with counts.
- `/tags/<namespace>/<name>` — every artifact (idea, doc, spec, change, code
  symbol, archive outcome) carrying that tag, stitched into one view.
- Tag chips on artifact cards (click → filter).
- Optional Wiki: `docs/tags/<name>.md` describes a tag.

## Next

- Promote into `add-cross-cutting-tags` change after `add-design-docs`.
- Tags subsume the earlier "capability page" idea — every capability *is* a tag.
