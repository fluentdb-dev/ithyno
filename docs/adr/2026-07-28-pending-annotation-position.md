---
title: PENDING annotation position (after SHALL/MUST body, not before)
date: 2026-07-28
status: accepted
related_change: fix-pending-annotation-parser-compat
---

# PENDING annotation position

## Context

The project uses `> ⚠️ **PENDING ...**` blockquotes in
`openspec/specs/<capability>/spec.md` to warn readers that an
in-flight change is about to MODIFY or REMOVE a landed requirement.
The annotation is inserted at propose time and disappears
automatically when the owning change is archived.

The natural place to put such an annotation is **directly under the
`### Requirement:` heading** — the reader's first eye-catch on the
requirement. CLAUDE.md's original "Format" block prescribed exactly
that position.

## Constraint

The openspec CLI (`@fission-ai/openspec` v1.4.x) parses each
requirement into a `text` field, taken from the FIRST non-empty,
non-metadata line after the `### Requirement:` header
(`parseRequirements` in
`node_modules/@fission-ai/openspec/dist/core/parsers/markdown-parser.js`).
Its Zod schema (`RequirementSchema` in
`node_modules/@fission-ai/openspec/dist/core/schemas/base.schema.js`)
then requires `text` to contain the substring `SHALL` or `MUST`.

When the annotation sits under the heading, that `> ⚠️ **PENDING ...**`
blockquote line IS the first non-empty content line — and it contains
no SHALL/MUST. Every archive from that point onward re-parses the full
capability spec after applying the delta and fails validation with:

```
✗ Requirement must contain SHALL or MUST keyword
```

This is not scoped to the change that owns the annotation — the same
error breaks `openspec archive` for every unrelated change touching
the same capability. In practice, 4 in-flight annotations in
`openspec/specs/dashboard/spec.md` blocked archive of 4 unrelated
changes until we discovered the pattern and used `--no-validate`.
Training the team to reach for `--no-validate` as the default is
worse than the annotation position, so we address the root cause.

## Decision

Place the PENDING annotation **immediately after** the requirement's
SHALL/MUST body paragraph, before any `#### Scenario:` header:

```md
### Requirement: <name>

<existing SHALL/MUST body — stays first non-empty line>

> ⚠️ **PENDING <ADDED|MODIFIED|REMOVED>** by [<change-id>](../../changes/<change-id>/): <一行理由>.

<remaining body / #### Scenario: blocks>
```

The annotation still lives inside the requirement's own block and
remains visible to human readers scanning the requirement; only the
first-line slot is preserved for the SHALL/MUST body.

CI enforces this via `server/openspec-annotation.test.ts`, which
walks every `openspec/specs/**/spec.md` and asserts the first
non-empty content line of each requirement contains SHALL or MUST.

## Alternatives considered

1. **Fork the openspec CLI parser** to skip blockquotes when
   extracting `text`. Rejected — creates a version-drift maintenance
   burden for a project convention.
2. **Use an HTML comment `<!-- PENDING ... -->` instead of a
   blockquote**. Rejected — invisible to human readers scanning the
   spec, which defeats the annotation's purpose (warning in-flight
   status).
3. **Move the annotation to a separate top-of-file section like
   `## In-Flight Annotations`**. Rejected — decouples the annotation
   from the requirement it annotates; a reader scanning the
   requirement block wouldn't see it.
4. **Rely on `--no-validate` at archive time**. Rejected — hides
   real validation errors and trains the team into a bad default.

## Consequences

- CLAUDE.md's hard-rule section is updated with the new format and
  a rationale pointer to this ADR.
- `.claude/skills/opsx-revert/SKILL.md` step 8 is updated to insert
  in the new position.
- `.claude/skills/openspec-flow/SKILL.md` "PENDING annotation" section
  updated to match.
- All 4 existing annotations in `openspec/specs/dashboard/spec.md`
  are repositioned to the new slot (see
  `fix-pending-annotation-parser-compat` diff).
- Future `openspec archive` runs no longer need `--no-validate` for
  this cause — the rebuild validator can be trusted again.
- CI regression test at `server/openspec-annotation.test.ts` catches
  any future regression at PR review time.

## Escape hatch

If a future requirement's SHALL/MUST body is genuinely two-paragraph
(rare), place the annotation after the LAST SHALL/MUST-bearing
paragraph, still before the first `#### Scenario:` header. The parser
only reads the first non-empty line, so anything after that is safe.
