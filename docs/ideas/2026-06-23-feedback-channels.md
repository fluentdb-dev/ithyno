---
status: exploring
tags: [area/docs, feature/feedback-loop, feature/typedoc]
source: conversation
related:
  - docs/ideas/2026-06-23-staged-docs.md
  - docs/ideas/2026-06-23-cross-cutting-tags.md
promoted_to: null
---

# Implementation feedback channels (stage 2 ← stage 4)

`typedoc` captures the **current state of the code** — function signatures,
docstrings — but not the **experience** of building it: trade-offs that proved
real, performance surprises, painful extension points. Stage-2 docs need a way
to receive that experience back from implementation.

## Three channels (use together)

| | captures | tool / convention |
|---|---|---|
| **A. Code-level annotations** | gotchas, perf notes, structural surprises | typedoc + custom tags: `@learned`, `@gotcha`, `@perf-note`, `@spec`, `@tag` |
| **B. Archive Outcome** | "what shipping this change was like" | Add `outcome.md` to the OpenSpec archive convention, or `## Outcome` section appended to `design.md` when archiving |
| **C. Capability docs** | synthesized lessons over time | `docs/capabilities/<name>.md`, human-authored periodically |

## Dashboard synthesis

Per-capability page stitches:
- the current spec (`openspec/specs/<cap>/spec.md`)
- code symbols with `@spec <cap>` annotation, plus their `@learned` / `@gotcha`
- archive outcomes from past changes that touched this capability
- the optional capability doc

→ When planning the next change in that area, all of the above sits on one page.
Cross-cutting tags (see [cross-cutting-tags](2026-06-23-cross-cutting-tags.md))
are how this works across stages.

## Open questions (still exploring)

- Exact format for `outcome.md` (free-form vs structured template).
- How many `@<tag>` vocabularies are too many before they become noise.
- Whether typedoc should be replaced by a custom extractor that understands
  these tags natively, or whether typedoc's tag plugin is sufficient.

## Sequencing (proposed)

1. `add-design-docs`
2. `add-cross-cutting-tags`
3. `add-archive-outcome`
4. `add-code-docs` (typedoc + the `@` vocabulary)
