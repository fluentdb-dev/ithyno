---
status: shaped
tags: [area/docs, feature/docs-pipeline]
source: conversation
related: []
promoted_to: null
---

# Staged docs model

Lifecycle for documentation artifacts in this project, distilled from the
conversation.

| stage | artifact | nature |
|---|---|---|
| ① idea | `docs/ideas/*.md` | human, exploratory |
| ② docs | `docs/*.md`, `docs/adr/`, `docs/architecture.md` | human, settled direction |
| ③ openspec | `openspec/changes/<id>/`, `openspec/specs/` | human, contractual |
| ④ implement | source code | machine-readable |
| ⑤ reference | typedoc output → `docs/api/` | generated |

## Decisions

- ② and ⑤ share the same `docs/` space; typedoc writes into `docs/api/`. The
  dashboard renders both, distinguishing with `Authored` / `Generated` badges.
- `openspec/` is reserved for contract-level artifacts (③ onward). ① and ② live
  under `docs/`.
- Each stage feeds the next, but **feedback flows backward** too — see
  [feedback-channels](2026-06-23-feedback-channels.md).

## Next

- Promote into `add-design-docs` change (renders `docs/` in the dashboard,
  including `docs/ideas/` and the future `docs/api/`).
