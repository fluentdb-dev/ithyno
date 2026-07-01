---
status: promoted
tags: [area/docs, feature/idea-capture]
source: conversation
related:
  - docs/ideas/2026-06-23-staged-docs.md
promoted_to: .claude/skills/openspec-flow/SKILL.md
---

# Idea capture rule

Design conversations produce insights that are worth keeping but are not yet
formal change proposals. Without a designated location, they vanish when the
conversation ends. This file is itself the first instance of the rule.

## Convention

```
docs/ideas/YYYY-MM-DD-<kebab-topic>.md
```

frontmatter:

```yaml
---
status: idea | exploring | shaped | promoted | dropped
tags: [feature/x, area/y]
source: conversation | brainstorm | research | explore
related: []                # paths to related ideas / docs / changes
promoted_to: null          # set when graduated
---
```

## Lifecycle

- `idea` — raw capture, not yet structured.
- `exploring` — being thought through, open questions remain.
- `shaped` — converged; ready to be promoted to a doc or change.
- `promoted` — graduated; `promoted_to` points at the destination.
- `dropped` — abandoned with a brief reason.

## Promotion (idea → docs / spec)

Ideas are **never deleted**. When an idea graduates, edit the frontmatter:

```yaml
status: promoted
promoted_to: openspec/changes/add-x/      # or docs/architecture.md, etc.
```

The trail stays intact; any spec or doc can be traced back to the conversation
that spawned it.

## Capture habit (encoded in skill)

The assistant writes `docs/ideas/<date>-<topic>.md` automatically at the end of
design conversations that produce "worth keeping, not yet a proposal" insight.
This rule is recorded in `.claude/skills/openspec-flow/SKILL.md` and `CLAUDE.md`
so it survives sessions.

## Naming

Use a noun phrase that names the concept, not the verb. `staged-docs.md`, not
`thinking-about-docs.md`. When the same topic returns in a later conversation,
update the existing file in place (preferred) or create a `-v2.md` companion.
