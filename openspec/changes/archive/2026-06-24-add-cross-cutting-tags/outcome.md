## ✅ What worked
- **Pure emergence (option A)** — no central registry, just `tags: [...]` in frontmatter — turned out to be the right scope for v1. The Tags page is genuinely useful with the ~16 tags currently in play; a registry would have added ceremony without benefit at this scale.
- **`splitTag` on the first `/` only** keeps namespace semantics crisp while allowing tag names with slashes later, without retrofitting.
- **TagChip / TagChipList as a shared component** kept chips consistent across Overview / ChangeDetail / Docs viewer, and `e.stopPropagation()` on the chip click meant chips inside cards don't trigger the card's navigation.
- **Frontmatter on change proposals** required adding gray-matter to `parseProposal`. The risk was breaking OpenSpec's own validator — but gray-matter strips the YAML before remark sees the body, so `openspec validate --all` continued to pass. Clean separation.
- **Two watchers both broadcasting `tags-updated`** was the minimal-cost way to keep the index live. Recomputing on every change is fast at this scale.

## ⚠️ What surprised us
- The original chip rendering showed the full `feature/cli-mode` under a `feature/` namespace header — visibly redundant. Caught during the very first live look at `/tags`. Lesson: render once, look at it, then write the spec — UI redundancy is hard to predict from text alone.
- The "what's a tag name when there's no namespace?" question wanted a clean answer. Bucketing prefix-less tags under a synthetic `other/` namespace (rather than into the literal-empty namespace) read as natural in practice.

## 🔁 What we'd do differently
- **Write the outcome.md before archiving.** This change itself was archived without one, which is exactly the lapse the skill update was supposed to prevent. The convention is one turn old; we proved it can be skipped under momentum. Worth strengthening the skill: explicit checklist before `openspec archive`.
- Render the `/tags` page once before finalizing the chip-text spec — would have caught the namespace redundancy in the proposal stage.

## 🌱 Follow-ups
- `add-code-docs` (queued): code symbols with `@tag screen/overview` (etc.) plug into the same index — no schema change, just a new artifact source in the collector.
- Lint follow-up: if two tags differ only in a hyphen (`feature/kanban` vs `feature/kanban-view`), surface a "did you mean?" hint in the Tags page. Currently human-eyeballed.
- Archive entry without outcome (this one and the sample's `initial-setup`) became the natural test fixture for the "no outcome" fallback path in `add-archive-outcome`. Convenient accident.
