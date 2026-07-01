---
tags: [feature/feedback-loop, area/docs, screen/change-detail]
---

## Why

OpenSpec's archive convention preserves the **intent** of each completed change
(proposal / design / specs / tasks). It does NOT capture what we **learned**
while implementing it: which design decisions proved right, which trade-offs
were tighter than expected, which gotchas only surfaced under load, what we
would do differently next time. Without a capture step, hard-won implementation
lessons evaporate when the conversation ends.

Now is a great moment to introduce this. Three changes are queued for archive
(`add-embedded-terminal`, `add-cli-command-mode`, `add-design-docs`) and three
recent archives (`add-ui-orchestration`, `add-archived-change-fallback`,
`persist-terminal-session`) are still fresh in memory.

This is channel B of the three feedback channels sketched in
[feedback-channels](../../../docs/ideas/2026-06-23-feedback-channels.md).

## What Changes

Add an `outcome.md` file to the OpenSpec archive convention for this project,
co-located with the other archive artifacts:

```
openspec/changes/archive/<YYYY-MM-DD>-<id>/
├── proposal.md
├── design.md
├── specs/
├── tasks.md
└── outcome.md         ← new
```

`outcome.md` is free-form markdown but follows a light template:

- **✅ What worked** — design decisions that paid off
- **⚠️ What surprised us** — pleasant or painful surprises
- **🔁 What we'd do differently** — concrete revisions for next time
- **🌱 Follow-ups** — seeds for future changes

The dashboard reads each archive directory's `outcome.md` (when present) and
renders it on the Archived panel of the Change Detail page. The Overview's
Archive list shows a small `✓ outcome` indicator on entries that have one.

The OpenSpec workflow skill is updated so writing `outcome.md` is part of the
archive step. The template lives in the skill, not in code — outcomes vary too
much to enforce structure.

This change also backfills `outcome.md` for the six already-archived (or
soon-to-be-archived) changes whose details are still recoverable from this
session.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `dashboard`: the Archived panel renders `outcome.md` when present, and the
  Overview Archive list shows an outcome indicator
- `openspec-parsing`: the archive scanner reads `outcome.md` and includes its
  body in the archive summary

## Impact

- `server/parser/workspace.ts`: read `outcome.md` for each archive entry
- `server/model.ts` / `web/src/types.ts`: extend `ChangeSummary` with `outcome`
- `web/src/pages/ChangeDetail.tsx`: render outcome on the archived panel
  (markdown via react-markdown, added by add-design-docs)
- `web/src/pages/Overview.tsx`: small outcome indicator on archive list
- `.claude/skills/openspec-flow/SKILL.md`: add the outcome template + workflow
  step
- Backfill: 6 `outcome.md` files for previously archived changes
- No new dependencies
